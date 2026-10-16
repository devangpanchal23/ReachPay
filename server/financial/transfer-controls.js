import { createCipheriv, createHmac, createHash, randomBytes } from 'node:crypto';
import { originOk } from '../auth-controller.js';

const MEMBER_ROLES = new Set(['OWNER','ADMIN','MAKER','CHECKER','VIEWER']);
const ADMIN_ROLES = ['OWNER','ADMIN'];
const MAKER_ROLES = ['OWNER','ADMIN','MAKER'];
const CHECKER_ROLES = ['OWNER','ADMIN','CHECKER'];
const DMT_CONSENT_TEXT = 'I consent to ReachPay storing my sender details and sharing them with an authorized DMT provider solely for sender registration and verification. No transfer is initiated by this consent.';
function minBigInt(rows,field) { return rows.map((row)=>BigInt(row[field])).reduce((min,value)=>value<min?value:min); }

export function canCreateTransfer(role) { return MAKER_ROLES.includes(role); }
export function canApproveTransfer(role, requesterId, approverId) {
  return CHECKER_ROLES.includes(role) && requesterId !== approverId;
}

function id(value) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '')); }
function cleanText(value, max = 180) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function dataKey() {
  const value = process.env.DMT_DATA_ENCRYPTION_KEY;
  if (!value || value.length < 32) {
    if (process.env.NODE_ENV !== 'production') {
      return createHash('sha256').update('reachpay_dev_fallback_dmt_data_encryption_key_32_bytes_long').digest();
    }
    throw Object.assign(new Error('DMT_DATA_ENCRYPTION_NOT_CONFIGURED'), { code: 'DMT_DATA_ENCRYPTION_NOT_CONFIGURED' });
  }
  return createHash('sha256').update(value).digest();
}
function encrypt(value) {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', dataKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return { ciphertext: ciphertext.toString('hex'), iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex') };
}
function digest(value) { return createHmac('sha256', dataKey()).update(value).digest('hex'); }
function rid(req) { return cleanText(req.headers?.['x-request-id'], 128) || null; }
function json(status, body) { return { status, body }; }
function parseLimit(value) { const number = Number(value); return Number.isSafeInteger(number) && number > 0 ? number : null; }

async function member(db, organizationId, userId) {
  const { rows } = await db.query(`SELECT m.role,m.status,o.status AS organization_status
    FROM financial_organization_members m JOIN financial_merchant_organizations o ON o.id=m.organization_id
    WHERE m.organization_id=$1 AND m.user_id=$2`, [organizationId,userId]);
  const row = rows[0];
  return row?.status === 'ACTIVE' && row.organization_status === 'ACTIVE' ? row : null;
}

async function audit(db, orgId, userId, eventType, targetType, targetId, reasonCode, requestId, metadata = {}) {
  await db.query(`INSERT INTO financial_organization_audit_events
    (organization_id,actor_user_id,event_type,target_type,target_id,reason_code,request_id,safe_metadata)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`, [orgId,userId,eventType,targetType,targetId || null,reasonCode || null,requestId,JSON.stringify(metadata)]);
}

export async function reserveTransferLimit(db, { organizationId, userId, serviceType, amountPaise, transactionId }) {
  const { rows: orgRows } = await db.query(`SELECT id FROM financial_merchant_organizations WHERE id=$1 AND status='ACTIVE' FOR UPDATE`, [organizationId]);
  if (!orgRows.length) return { ok:false, blocker:'ORGANIZATION_UNAVAILABLE' };
  const { rows: limits } = await db.query(`SELECT * FROM financial_transaction_limits
    WHERE organization_id=$1 AND service_type=$2 AND active=true
    AND (user_id IS NULL OR user_id=$3) ORDER BY limit_source,user_id NULLS FIRST`, [organizationId,serviceType,userId]);
  const merchantOrg = limits.filter((row) => row.limit_source === 'MERCHANT' && !row.user_id);
  if (!merchantOrg.length) return { ok:false, blocker:'TRANSFER_LIMITS_NOT_CONFIGURED' };
  const applicable = limits;
  const orgPolicies=applicable.filter((row)=>!row.user_id);
  const perTransaction = minBigInt(applicable,'max_per_transaction_paise');
  if (BigInt(amountPaise) > perTransaction) return { ok:false, blocker:'PER_TRANSACTION_LIMIT_EXCEEDED' };
  const orgDayLimit = minBigInt(orgPolicies,'max_per_day_paise');
  const orgMonthLimit = minBigInt(orgPolicies,'max_per_month_paise');
  const userPolicies = applicable.filter((row) => row.user_id === userId);
  const userDayLimit = userPolicies.length ? minBigInt(userPolicies,'max_per_day_paise') : null;
  const userMonthLimit = userPolicies.length ? minBigInt(userPolicies,'max_per_month_paise') : null;
  const totals = await db.query(`SELECT
    COALESCE(SUM(amount_paise) FILTER (WHERE created_at >= date_trunc('day',now())),0)::text AS org_day,
    COALESCE(SUM(amount_paise) FILTER (WHERE created_at >= date_trunc('month',now())),0)::text AS org_month,
    COALESCE(SUM(amount_paise) FILTER (WHERE user_id=$2 AND created_at >= date_trunc('day',now())),0)::text AS user_day,
    COALESCE(SUM(amount_paise) FILTER (WHERE user_id=$2 AND created_at >= date_trunc('month',now())),0)::text AS user_month
    FROM financial_limit_utilization WHERE organization_id=$1 AND service_type=$3 AND status IN ('RESERVED','CONSUMED')`, [organizationId,userId,serviceType]);
  const current = totals.rows[0];
  if (BigInt(current.org_day) + BigInt(amountPaise) > orgDayLimit) return { ok:false, blocker:'ORGANIZATION_DAILY_LIMIT_EXCEEDED' };
  if (BigInt(current.org_month) + BigInt(amountPaise) > orgMonthLimit) return { ok:false, blocker:'ORGANIZATION_MONTHLY_LIMIT_EXCEEDED' };
  if (userDayLimit && BigInt(current.user_day) + BigInt(amountPaise) > userDayLimit) return { ok:false, blocker:'USER_DAILY_LIMIT_EXCEEDED' };
  if (userMonthLimit && BigInt(current.user_month) + BigInt(amountPaise) > userMonthLimit) return { ok:false, blocker:'USER_MONTHLY_LIMIT_EXCEEDED' };
  await db.query(`INSERT INTO financial_limit_utilization(organization_id,user_id,service_type,transaction_id,amount_paise)
    VALUES($1,$2,$3,$4,$5)`, [organizationId,userId,serviceType,transactionId,amountPaise]);
  return { ok:true };
}

async function organizations(db, userId) {
  const { rows } = await db.query(`SELECT o.id,o.legal_name,o.status,o.verification_status,m.role,m.status AS membership_status
    FROM financial_merchant_organizations o JOIN financial_organization_members m ON m.organization_id=o.id
    WHERE m.user_id=$1 AND m.status='ACTIVE' AND o.status='ACTIVE' ORDER BY o.created_at DESC`, [userId]);
  return rows;
}

export async function handleTransferControlRequest(req, url, body, user, db) {
  const method = String(req.method || 'GET').toUpperCase();
  const parts = url.pathname.split('/').filter(Boolean).slice(2);
  const resource = parts[0];
  if (resource !== 'organizations') return null;
  if (!['GET','POST','PATCH','PUT'].includes(method)) return json(405,{error:'METHOD_NOT_ALLOWED'});
  if (method !== 'GET' && !originOk(req)) return json(403,{error:'ORIGIN_NOT_ALLOWED'});

  if (resource === 'organizations' && parts.length === 1 && method === 'GET') return json(200,{organizations:await organizations(db,user.id)});
  if (resource === 'organizations' && parts.length === 1 && method === 'POST') {
    const name = cleanText(body.legalName,180);
    if (name.length < 2) return json(400,{error:'LEGAL_NAME_REQUIRED'});
    await db.query('BEGIN');
    try {
      const created = await db.query(`INSERT INTO financial_merchant_organizations(legal_name,created_by) VALUES($1,$2) RETURNING id,legal_name,status,verification_status,created_at`,[name,user.id]);
      const org = created.rows[0];
      await db.query(`INSERT INTO financial_organization_members(organization_id,user_id,role,created_by) VALUES($1,$2,'OWNER',$2)`,[org.id,user.id]);
      await audit(db,org.id,user.id,'ORGANIZATION_CREATED','ORGANIZATION',org.id,null,rid(req));
      await db.query('COMMIT');
      return json(201,{organization:{...org,role:'OWNER'}});
    } catch (error) { await db.query('ROLLBACK').catch(()=>{}); throw error; }
  }
  if (resource === 'organizations') {
    const organizationId = parts[1];
    if (!id(organizationId)) return json(400,{error:'INVALID_ORGANIZATION_ID'});
    const own = await member(db,organizationId,user.id);
    if (!own) return json(404,{error:'ORGANIZATION_NOT_FOUND'});
    const section = parts[2];
    if (section === 'members' && parts.length === 3 && method === 'GET') {
      if (!ADMIN_ROLES.includes(own.role)) return json(403,{error:'ORGANIZATION_ADMIN_REQUIRED'});
      const {rows}=await db.query(`SELECT m.user_id,m.role,m.status,m.created_at,a.name,a.email
        FROM financial_organization_members m JOIN customer_accounts a ON a.id=m.user_id
        WHERE m.organization_id=$1 ORDER BY m.created_at`,[organizationId]);
      return json(200,{members:rows});
    }
    if (section === 'members' && parts.length === 3 && method === 'POST') {
      if (!ADMIN_ROLES.includes(own.role)) return json(403,{error:'ORGANIZATION_ADMIN_REQUIRED'});
      const email=cleanText(body.email,254).toLowerCase(); const role=cleanText(body.role,16).toUpperCase();
      if (!email.includes('@') || !MEMBER_ROLES.has(role) || role==='OWNER') return json(400,{error:'INVALID_MEMBER'});
      if (role==='ADMIN' && own.role!=='OWNER') return json(403,{error:'OWNER_ACTION_REQUIRED'});
      const {rows:accounts}=await db.query(`SELECT id FROM customer_accounts WHERE lower(email)=lower($1) AND status='ACTIVE'`,[email]);
      if (!accounts.length) return json(404,{error:'ACTIVE_ACCOUNT_NOT_FOUND'});
      const memberId=accounts[0].id;
      const previous=await db.query(`SELECT role FROM financial_organization_members WHERE organization_id=$1 AND user_id=$2`,[organizationId,memberId]);
      if(previous.rows[0]?.role==='OWNER')return json(409,{error:'ORGANIZATION_OWNER_CANNOT_BE_REASSIGNED'});
      if(previous.rows[0]?.role==='ADMIN'&&own.role!=='OWNER')return json(403,{error:'OWNER_ACTION_REQUIRED'});
      await db.query('BEGIN');
      try {
        await db.query(`INSERT INTO financial_organization_members(organization_id,user_id,role,status,created_by)
          VALUES($1,$2,$3,'ACTIVE',$4) ON CONFLICT(organization_id,user_id) DO UPDATE SET role=EXCLUDED.role,status='ACTIVE',updated_at=now()`,[organizationId,memberId,role,user.id]);
        await audit(db,organizationId,user.id,'ORGANIZATION_MEMBER_UPSERTED','MEMBER',memberId,null,rid(req),{role});
        await db.query('COMMIT');
        return json(200,{member:{userId:memberId,role,status:'ACTIVE'}});
      } catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
    }
    if (section==='members' && parts.length===4 && method==='PATCH') {
      if (!ADMIN_ROLES.includes(own.role)) return json(403,{error:'ORGANIZATION_ADMIN_REQUIRED'});
      const memberId=parts[3]; const role=cleanText(body.role,16).toUpperCase(); const status=cleanText(body.status,16).toUpperCase();
      if (!id(memberId) || (role && (!MEMBER_ROLES.has(role)||role==='OWNER')) || (status && !['ACTIVE','INACTIVE'].includes(status))) return json(400,{error:'INVALID_MEMBER_UPDATE'});
      const prior=await db.query(`SELECT role,status FROM financial_organization_members WHERE organization_id=$1 AND user_id=$2`,[organizationId,memberId]);
      if (!prior.rows.length) return json(404,{error:'MEMBER_NOT_FOUND'});
      if (prior.rows[0].role==='OWNER') return json(403,{error:'OWNER_MEMBERSHIP_IS_IMMUTABLE'});
      if (prior.rows[0].role==='ADMIN' && own.role!=='OWNER') return json(403,{error:'OWNER_ACTION_REQUIRED'});
      const nextRole=role||prior.rows[0].role; const nextStatus=status||prior.rows[0].status;
      const {rows}=await db.query(`UPDATE financial_organization_members SET role=$3,status=$4,updated_at=now()
        WHERE organization_id=$1 AND user_id=$2 RETURNING user_id,role,status`,[organizationId,memberId,nextRole,nextStatus]);
      await audit(db,organizationId,user.id,'ORGANIZATION_MEMBER_UPDATED','MEMBER',memberId,null,rid(req),{role:nextRole,status:nextStatus});
      return json(200,{member:rows[0]});
    }
    if (section==='limits' && parts.length===3 && method==='GET') {
      if (!ADMIN_ROLES.includes(own.role)) return json(403,{error:'ORGANIZATION_ADMIN_REQUIRED'});
      const {rows}=await db.query(`SELECT id,service_type,user_id,max_per_transaction_paise,max_per_day_paise,max_per_month_paise,limit_source,evidence_reference,active,updated_at
        FROM financial_transaction_limits WHERE organization_id=$1 ORDER BY service_type,user_id NULLS FIRST,limit_source`,[organizationId]);
      return json(200,{limits:rows,providerOrRegulatoryLimits:'NOT_VERIFIED',transfersEnabled:false});
    }
    if (section==='limits' && parts.length===3 && method==='PUT') {
      if (!ADMIN_ROLES.includes(own.role)) return json(403,{error:'ORGANIZATION_ADMIN_REQUIRED'});
      const serviceType=cleanText(body.serviceType,24).toUpperCase();
      const maxTxn=parseLimit(body.maxPerTransactionPaise),maxDay=parseLimit(body.maxPerDayPaise),maxMonth=parseLimit(body.maxPerMonthPaise);
      let userId=body.userId||null;
      if (!['DMT','BANK_TRANSFER'].includes(serviceType)||!maxTxn||!maxDay||!maxMonth||maxTxn>maxDay||maxDay>maxMonth) return json(400,{error:'INVALID_MERCHANT_LIMITS'});
      if (userId && !id(userId)) return json(400,{error:'INVALID_LIMIT_USER'});
      if (userId) { const exists=await db.query(`SELECT 1 FROM financial_organization_members WHERE organization_id=$1 AND user_id=$2 AND status='ACTIVE'`,[organizationId,userId]); if(!exists.rows.length)return json(404,{error:'ACTIVE_MEMBER_NOT_FOUND'}); }
      await db.query('BEGIN');
      try {
        await db.query(`SELECT id FROM financial_merchant_organizations WHERE id=$1 FOR UPDATE`,[organizationId]);
        const existing=await db.query(`SELECT id FROM financial_transaction_limits WHERE organization_id=$1 AND service_type=$2 AND user_id IS NOT DISTINCT FROM $3::uuid AND limit_source='MERCHANT' FOR UPDATE`,[organizationId,serviceType,userId]);
        let result;
        if(existing.rows.length) result=await db.query(`UPDATE financial_transaction_limits SET max_per_transaction_paise=$2,max_per_day_paise=$3,max_per_month_paise=$4,configured_by=$5,active=true,updated_at=now() WHERE id=$1 RETURNING id,service_type,user_id,max_per_transaction_paise,max_per_day_paise,max_per_month_paise,limit_source,active`,[existing.rows[0].id,maxTxn,maxDay,maxMonth,user.id]);
        else result=await db.query(`INSERT INTO financial_transaction_limits(organization_id,service_type,user_id,max_per_transaction_paise,max_per_day_paise,max_per_month_paise,configured_by)
          VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,service_type,user_id,max_per_transaction_paise,max_per_day_paise,max_per_month_paise,limit_source,active`,[organizationId,serviceType,userId,maxTxn,maxDay,maxMonth,user.id]);
        await audit(db,organizationId,user.id,'TRANSFER_LIMIT_CONFIGURED','TRANSFER_LIMIT',result.rows[0].id,null,rid(req),{serviceType,userLimit:Boolean(userId)});
        await db.query('COMMIT');
        return json(200,{limit:result.rows[0],providerOrRegulatoryLimits:'NOT_VERIFIED'});
      } catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
    }
    if(section==='senders' && parts.length===3 && method==='GET') {
      if(!MAKER_ROLES.includes(own.role)&&own.role!=='VIEWER'&&own.role!=='CHECKER')return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
      const {rows}=await db.query(`SELECT id,full_name,masked_mobile,kyc_status,provider,provider_sender_reference,kyc_verified_at,created_at
        FROM financial_dmt_sender_profiles WHERE organization_id=$1 ORDER BY created_at DESC`,[organizationId]);
      return json(200,{senders:rows});
    }
    if(section==='senders' && parts.length===3 && method==='POST') {
      if(!MAKER_ROLES.includes(own.role))return json(403,{error:'TRANSFER_MAKER_REQUIRED'});
      const fullName=cleanText(body.fullName,160),mobile=String(body.mobile||'').replace(/\s/g,'');
      const consent=body.consent===true,consentVersion=cleanText(body.consentVersion,32);
      if(fullName.length<2||fullName.length>160||!/^\+91[6-9]\d{9}$/.test(mobile)||!consent||!consentVersion)return json(400,{error:'SENDER_DETAILS_AND_EXPLICIT_CONSENT_REQUIRED'});
      const encrypted=encrypt(mobile),fingerprint=digest(mobile),masked=`+91••••••${mobile.slice(-4)}`;
      await db.query('BEGIN');
      try {
        const {rows}=await db.query(`INSERT INTO financial_dmt_sender_profiles(organization_id,owner_user_id,full_name,mobile_ciphertext,mobile_iv,mobile_tag,mobile_fingerprint,masked_mobile)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,full_name,masked_mobile,kyc_status,created_at`,[organizationId,user.id,fullName,encrypted.ciphertext,encrypted.iv,encrypted.tag,fingerprint,masked]);
        const consentTextHash=createHash('sha256').update(`${consentVersion}:${DMT_CONSENT_TEXT}`).digest('hex');
        await db.query(`INSERT INTO financial_dmt_sender_consents(sender_profile_id,organization_id,actor_user_id,consent_version,consent_text_sha256,consented_at,request_id)
          VALUES($1,$2,$3,$4,$5,now(),$6)`,[rows[0].id,organizationId,user.id,consentVersion,consentTextHash,rid(req)]);
        await audit(db,organizationId,user.id,'DMT_SENDER_REGISTERED','DMT_SENDER',rows[0].id,'KYC_NOT_VERIFIED',rid(req),{consentVersion});
        await db.query('COMMIT');
        return json(201,{sender:rows[0],kyc:'NOT_STARTED',otp:'UNAVAILABLE_PROVIDER_NOT_CONFIGURED'});
      }catch(error){await db.query('ROLLBACK').catch(()=>{});if(error.code==='23505')return json(409,{error:'SENDER_ALREADY_REGISTERED'});throw error;}
    }
    if(section==='senders' && parts.length===5 && parts[4]==='otp' && method==='POST') {
      if(!MAKER_ROLES.includes(own.role))return json(403,{error:'TRANSFER_MAKER_REQUIRED'});
      const senderId=parts[3];
      if(!id(senderId))return json(400,{error:'INVALID_SENDER_ID'});
      const sender=await db.query(`SELECT id FROM financial_dmt_sender_profiles WHERE id=$1 AND organization_id=$2`,[senderId,organizationId]);
      if(!sender.rows.length)return json(404,{error:'DMT_SENDER_NOT_FOUND'});
      const {rows}=await db.query(`INSERT INTO financial_dmt_otp_attempts(organization_id,sender_profile_id,requested_by,status,blocker_code,request_id)
        VALUES($1,$2,$3,'UNAVAILABLE','DMT_OTP_PROVIDER_NOT_CONFIGURED',$4) RETURNING id,status,blocker_code,created_at`,[organizationId,senderId,user.id,rid(req)]);
      await audit(db,organizationId,user.id,'DMT_OTP_UNAVAILABLE','DMT_OTP_ATTEMPT',rows[0].id,rows[0].blocker_code,rid(req));
      return json(503,{otpAttempt:rows[0],sent:false});
    }
    if(section==='senders' && parts.length===5 && parts[4]==='kyc' && method==='POST') {
      if(!MAKER_ROLES.includes(own.role))return json(403,{error:'TRANSFER_MAKER_REQUIRED'});
      const senderId=parts[3];
      if(!id(senderId))return json(400,{error:'INVALID_SENDER_ID'});
      const sender=await db.query(`SELECT id FROM financial_dmt_sender_profiles WHERE id=$1 AND organization_id=$2`,[senderId,organizationId]);
      if(!sender.rows.length)return json(404,{error:'DMT_SENDER_NOT_FOUND'});
      const {rows}=await db.query(`INSERT INTO financial_dmt_kyc_records(organization_id,sender_profile_id,requested_by,status,blocker_code)
        VALUES($1,$2,$3,'UNAVAILABLE','DMT_KYC_PROVIDER_NOT_CONFIGURED') RETURNING id,status,blocker_code,created_at`,[organizationId,senderId,user.id]);
      await audit(db,organizationId,user.id,'DMT_KYC_UNAVAILABLE','DMT_KYC_REQUEST',rows[0].id,rows[0].blocker_code,rid(req));
      return json(503,{kycRequest:rows[0],verified:false});
    }
    if(section==='beneficiaries' && parts.length===4 && parts[3]==='verification' && method==='POST') {
      if(!MAKER_ROLES.includes(own.role))return json(403,{error:'TRANSFER_MAKER_REQUIRED'});
      const beneficiaryId=parts[2];
      if(!id(beneficiaryId))return json(400,{error:'INVALID_BENEFICIARY_ID'});
      const found=await db.query(`SELECT id FROM financial_beneficiaries WHERE id=$1 AND user_id=$2 AND verification_status<>'DISABLED'`,[beneficiaryId,user.id]);
      if(!found.rows.length)return json(404,{error:'BENEFICIARY_NOT_FOUND'});
      const {rows}=await db.query(`INSERT INTO financial_beneficiary_verification_records(organization_id,beneficiary_id,requested_by,status,blocker_code)
        VALUES($1,$2,$3,'UNAVAILABLE','BANK_VERIFICATION_PROVIDER_NOT_CONFIGURED') RETURNING id,status,blocker_code,created_at`,[organizationId,beneficiaryId,user.id]);
      await audit(db,organizationId,user.id,'BENEFICIARY_VERIFICATION_UNAVAILABLE','BENEFICIARY_VERIFICATION',rows[0].id,rows[0].blocker_code,rid(req));
      return json(503,{verification:rows[0],charged:false});
    }
    if(section==='approvals' && parts.length===3 && method==='GET') {
      if(!CHECKER_ROLES.includes(own.role)&&!MAKER_ROLES.includes(own.role))return json(403,{error:'ORGANIZATION_ACCESS_DENIED'});
      const {rows}=await db.query(`SELECT a.id,a.transaction_id,a.requester_user_id,a.approver_user_id,a.status,a.decision_reason,a.created_at,a.decided_at,
        t.public_reference,t.service_type,t.amount_paise,t.status AS transaction_status,t.blocker_code
        FROM financial_transaction_approvals a JOIN financial_service_transactions t ON t.id=a.transaction_id
        WHERE a.organization_id=$1 ORDER BY a.created_at DESC LIMIT 100`,[organizationId]);
      return json(200,{approvals:rows});
    }
    if(section==='approvals' && parts.length===3 && method==='POST') {
      if(!MAKER_ROLES.includes(own.role))return json(403,{error:'TRANSFER_MAKER_REQUIRED'});
      const reference=cleanText(body.transactionReference,64);
      await db.query('BEGIN');
      try {
        const tx=await db.query(`SELECT id,user_id,status,service_type FROM financial_service_transactions WHERE organization_id=$1 AND public_reference=$2 FOR UPDATE`,[organizationId,reference]);
        if(!tx.rows.length){await db.query('ROLLBACK');return json(404,{error:'TRANSACTION_NOT_FOUND'});}
        const transaction=tx.rows[0];
        if(transaction.user_id!==user.id){await db.query('ROLLBACK');return json(403,{error:'REQUESTER_MUST_OWN_TRANSACTION'});}
        if(!['DMT','BANK_TRANSFER'].includes(transaction.service_type)||transaction.status!=='DRAFT'){await db.query('ROLLBACK');return json(409,{error:'TRANSACTION_NOT_APPROVAL_READY'});}
        const reserved=await db.query(`SELECT 1 FROM financial_limit_utilization WHERE transaction_id=$1 AND status='RESERVED'`,[transaction.id]);
        if(!reserved.rows.length){await db.query('ROLLBACK');return json(409,{error:'TRANSFER_LIMITS_NOT_CONFIGURED_OR_EXCEEDED'});}
        await db.query(`UPDATE financial_service_transactions SET status='AUTHORIZATION_PENDING',updated_at=now() WHERE id=$1 RETURNING id`,[transaction.id]);
        const approval=await db.query(`INSERT INTO financial_transaction_approvals(organization_id,transaction_id,requester_user_id,status,request_id,expires_at)
          VALUES($1,$2,$3,'PENDING',$4,now()+interval '24 hours') RETURNING id,status,created_at,expires_at`,[organizationId,transaction.id,user.id,rid(req)]);
        await db.query(`INSERT INTO financial_service_transaction_history(transaction_id,from_status,to_status,actor_user_id,reason_code,request_id)
          VALUES($1,'DRAFT','AUTHORIZATION_PENDING',$2,'MAKER_CHECKER_REQUESTED',$3)`,[transaction.id,user.id,rid(req)]);
        await db.query(`INSERT INTO financial_approval_history(approval_id,organization_id,actor_user_id,action,request_id) VALUES($1,$2,$3,'REQUESTED',$4)`,[approval.rows[0].id,organizationId,user.id,rid(req)]);
        await audit(db,organizationId,user.id,'TRANSFER_APPROVAL_REQUESTED','TRANSFER_APPROVAL',approval.rows[0].id,null,rid(req),{transactionId:transaction.id});
        await db.query('COMMIT');
        return json(201,{approval:approval.rows[0],transactionStatus:'AUTHORIZATION_PENDING',submission:'DISABLED_UNTIL_PROVIDER_AND_FUNDING_APPROVAL'});
      }catch(error){await db.query('ROLLBACK').catch(()=>{});if(error.code==='23505')return json(409,{error:'PENDING_APPROVAL_ALREADY_EXISTS'});throw error;}
    }
    if(section==='approvals' && parts.length===4 && method==='POST') {
      if(!CHECKER_ROLES.includes(own.role))return json(403,{error:'TRANSFER_CHECKER_REQUIRED'});
      const approvalId=parts[3],decision=cleanText(body.decision,16).toUpperCase(),reason=cleanText(body.reason,256);
      if(!id(approvalId)||!['APPROVED','REJECTED'].includes(decision))return json(400,{error:'INVALID_APPROVAL_DECISION'});
      await db.query('BEGIN');
      try {
        const {rows}=await db.query(`SELECT a.*,t.status AS transaction_status,t.public_reference FROM financial_transaction_approvals a
          JOIN financial_service_transactions t ON t.id=a.transaction_id WHERE a.organization_id=$1 AND a.id=$2 FOR UPDATE OF a,t`,[organizationId,approvalId]);
        if(!rows.length){await db.query('ROLLBACK');return json(404,{error:'APPROVAL_NOT_FOUND'});}
        const approval=rows[0];
        if(approval.status!=='PENDING'){await db.query('ROLLBACK');return json(409,{error:'APPROVAL_ALREADY_DECIDED'});}
        if(!canApproveTransfer(own.role,approval.requester_user_id,user.id)){await db.query('ROLLBACK');return json(403,{error:'MAKER_CANNOT_APPROVE_OWN_TRANSACTION'});}
        const result=await db.query(`UPDATE financial_transaction_approvals SET approver_user_id=$2,status=$3,decision_reason=$4,decided_at=now(),decision_request_id=$5
          WHERE id=$1 AND status='PENDING' RETURNING id,status,approver_user_id,decided_at`,[approvalId,user.id,decision,reason||null,rid(req)]);
        if(decision==='REJECTED') {
          await db.query(`UPDATE financial_service_transactions SET status='FAILED',blocker_code='MAKER_CHECKER_REJECTED',updated_at=now(),completed_at=now() WHERE id=$1`,[approval.transaction_id]);
          await db.query(`UPDATE financial_limit_utilization SET status='RELEASED',updated_at=now() WHERE transaction_id=$1 AND status='RESERVED'`,[approval.transaction_id]);
          await db.query(`INSERT INTO financial_service_transaction_history(transaction_id,from_status,to_status,actor_user_id,reason_code,request_id)
            VALUES($1,$2,'FAILED',$3,'MAKER_CHECKER_REJECTED',$4)`,[approval.transaction_id,approval.transaction_status,user.id,rid(req)]);
        }
        await db.query(`INSERT INTO financial_approval_history(approval_id,organization_id,actor_user_id,action,reason,request_id)
          VALUES($1,$2,$3,$4,$5,$6)`,[approvalId,organizationId,user.id,decision,reason||null,rid(req)]);
        await audit(db,organizationId,user.id,`TRANSFER_${decision}`,'TRANSFER_APPROVAL',approvalId,null,rid(req),{transactionReference:approval.public_reference});
        await db.query('COMMIT');
        return json(200,{approval:result.rows[0],transferSubmission:'DISABLED_PROVIDER_OR_FUNDING_AUTHORIZATION_REQUIRED'});
      }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
    }
    return json(404,{error:'ROUTE_NOT_FOUND'});
  }
  return null;
}
