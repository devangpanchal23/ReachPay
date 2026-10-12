import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { canApproveTransfer, canCreateTransfer, reserveTransferLimit } from '../server/financial/transfer-controls.js';
import { expireAbandonedTransfers } from '../server/financial/transaction-maintenance.js';

test('organization roles separate makers from checkers and prevent self-approval', () => {
  assert.equal(canCreateTransfer('MAKER'), true);
  assert.equal(canCreateTransfer('VIEWER'), false);
  assert.equal(canApproveTransfer('CHECKER','maker-id','checker-id'), true);
  assert.equal(canApproveTransfer('MAKER','maker-id','checker-id'), false);
  assert.equal(canApproveTransfer('CHECKER','same-id','same-id'), false);
});

const testUrl = process.env.REACHPAY_TEST_DATABASE_URL;
const isolated = (() => { try { return testUrl && new URL(testUrl).pathname.replace(/^\//,'') === 'reachpay_test'; } catch { return false; } })();

test('organization daily limits are reserved atomically under concurrent transfer requests', { skip: !isolated && 'REACHPAY_TEST_DATABASE_URL must target reachpay_test.' }, async () => {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString:testUrl,max:4,connectionTimeoutMillis:5000,query_timeout:10000 });
  const ownerId=randomUUID(), checkerId=randomUUID(), orgId=randomUUID(), otherOrgId=randomUUID(), beneficiaryId=randomUUID(), sourceId=randomUUID();
  const txIds=[randomUUID(),randomUUID(),randomUUID()]; const suffix=randomUUID();
  let first,second;
  let cleanupError;
  try {
    const setup=await pool.connect();
    try {
      await setup.query('BEGIN');
      await setup.query(`INSERT INTO customer_accounts(id,name,email,mobile_e164,password_hash,password_salt,status) VALUES($1,'Transfer test owner',$2,$3,$4,$5,'ACTIVE')`,[ownerId,`transfer-${suffix}@example.test`,`+1999${suffix.replaceAll('-','').slice(0,10)}`,'0'.repeat(128),'0'.repeat(32)]);
      await setup.query(`INSERT INTO customer_accounts(id,name,email,mobile_e164,password_hash,password_salt,status) VALUES($1,'Transfer test checker',$2,$3,$4,$5,'ACTIVE')`,[checkerId,`checker-${suffix}@example.test`,`+1888${suffix.replaceAll('-','').slice(0,10)}`,'1'.repeat(128),'1'.repeat(32)]);
      await setup.query(`INSERT INTO financial_merchant_organizations(id,legal_name,created_by) VALUES($1,$2,$3)`,[orgId,`Transfer test ${suffix}`,ownerId]);
      await setup.query(`INSERT INTO financial_merchant_organizations(id,legal_name,created_by) VALUES($1,$2,$3)`,[otherOrgId,`Other test ${suffix}`,ownerId]);
      await setup.query(`INSERT INTO financial_organization_members(organization_id,user_id,role,created_by) VALUES($1,$2,'OWNER',$2)`,[orgId,ownerId]);
      await setup.query(`INSERT INTO financial_organization_members(organization_id,user_id,role,created_by) VALUES($1,$2,'OWNER',$2)`,[otherOrgId,ownerId]);
      await setup.query(`INSERT INTO financial_organization_members(organization_id,user_id,role,created_by) VALUES($1,$2,'CHECKER',$3)`,[orgId,checkerId,ownerId]);
      await setup.query(`INSERT INTO financial_beneficiaries(id,user_id,display_name,bank_account_ciphertext,bank_account_iv,bank_account_tag,ifsc_code,account_fingerprint,masked_destination)
        VALUES($1,$2,'Transfer test beneficiary','cipher','000000000000000000000000','00000000000000000000000000000000','ABCD0123456',$3,'••••1234')`,[beneficiaryId,ownerId,'a'.repeat(64)]);
      await setup.query(`INSERT INTO financial_funding_sources(id,user_id,provider,account_reference_ciphertext,account_reference_iv,account_reference_tag,account_reference_fingerprint,masked_reference)
        VALUES($1,$2,'bank','cipher','000000000000000000000000','00000000000000000000000000000000',$3,'••••4321')`,[sourceId,ownerId,'b'.repeat(64)]);
      await setup.query(`INSERT INTO financial_transaction_limits(organization_id,service_type,max_per_transaction_paise,max_per_day_paise,max_per_month_paise,configured_by)
        VALUES($1,'BANK_TRANSFER',100,150,300,$2)`,[orgId,ownerId]);
      for(let i=0;i<2;i++) await setup.query(`INSERT INTO financial_service_transactions(id,public_reference,user_id,organization_id,service_type,funding_source_id,beneficiary_id,status,amount_paise,idempotency_key)
        VALUES($1,$2,$3,$4,'BANK_TRANSFER',$5,$6,'DRAFT',100,$7)`,[txIds[i],`RPFS_TEST_${suffix}_${i}`,ownerId,orgId,sourceId,beneficiaryId,`transfer-test-${suffix}-${i}`]);
      await setup.query(`INSERT INTO financial_service_transactions(id,public_reference,user_id,organization_id,service_type,funding_source_id,beneficiary_id,status,amount_paise,idempotency_key,expires_at)
        VALUES($1,$2,$3,$4,'BANK_TRANSFER',$5,$6,'DRAFT',25,$7,now()-interval '1 minute')`,[txIds[2],`RPFS_TEST_${suffix}_expired`,ownerId,orgId,sourceId,beneficiaryId,`transfer-test-${suffix}-expired`]);
      await setup.query(`UPDATE financial_service_transactions SET status='AUTHORIZATION_PENDING' WHERE id=$1`,[txIds[2]]);
      await setup.query(`INSERT INTO financial_transaction_approvals(organization_id,transaction_id,requester_user_id,status,expires_at)
        VALUES($1,$2,$3,'PENDING',now()-interval '1 minute')`,[orgId,txIds[2],ownerId]);
      await setup.query(`INSERT INTO financial_limit_utilization(organization_id,user_id,service_type,transaction_id,amount_paise)
        VALUES($1,$2,'BANK_TRANSFER',$3,25)`,[orgId,ownerId,txIds[2]]);
      await setup.query(`UPDATE financial_service_transactions SET status='AUTHORIZATION_PENDING' WHERE id=$1`,[txIds[0]]);
      await setup.query('SAVEPOINT reject_cross_organization_approval');
      await assert.rejects(setup.query(`INSERT INTO financial_transaction_approvals(organization_id,transaction_id,requester_user_id,status)
        VALUES($1,$2,$3,'PENDING')`,[otherOrgId,txIds[0],ownerId]),/Approval organization must match transaction organization/i);
      await setup.query('ROLLBACK TO SAVEPOINT reject_cross_organization_approval');
      const approval=await setup.query(`INSERT INTO financial_transaction_approvals(organization_id,transaction_id,requester_user_id,status)
        VALUES($1,$2,$3,'PENDING') RETURNING id`,[orgId,txIds[0],ownerId]);
      await setup.query('SAVEPOINT reject_self_approval');
      await assert.rejects(setup.query(`UPDATE financial_transaction_approvals SET approver_user_id=$2,status='APPROVED',decided_at=now() WHERE id=$1`,[approval.rows[0].id,ownerId]),/maker cannot approve their own transaction/i);
      await setup.query('ROLLBACK TO SAVEPOINT reject_self_approval');
      await setup.query(`UPDATE financial_organization_members SET status='INACTIVE' WHERE organization_id=$1 AND user_id=$2`,[orgId,checkerId]);
      await setup.query('SAVEPOINT reject_inactive_checker');
      await assert.rejects(setup.query(`UPDATE financial_transaction_approvals SET approver_user_id=$2,status='APPROVED',decided_at=now() WHERE id=$1`,[approval.rows[0].id,checkerId]),/active checker is required/i);
      await setup.query('ROLLBACK TO SAVEPOINT reject_inactive_checker');
      await setup.query(`UPDATE financial_organization_members SET status='ACTIVE' WHERE organization_id=$1 AND user_id=$2`,[orgId,checkerId]);
      await setup.query(`UPDATE financial_transaction_approvals SET approver_user_id=$2,status='APPROVED',decided_at=now() WHERE id=$1`,[approval.rows[0].id,checkerId]);
      await setup.query('SAVEPOINT block_unverified_submission');
      await assert.rejects(setup.query(`UPDATE financial_service_transactions SET status='READY_FOR_SUBMISSION' WHERE id=$1`,[txIds[0]]),/Verified merchant organization evidence is required/i);
      await setup.query('ROLLBACK TO SAVEPOINT block_unverified_submission');
      await setup.query('COMMIT');
    } catch(error) { await setup.query('ROLLBACK').catch(()=>{}); throw error; }
    finally { setup.release(); }

    const maintenance=await pool.connect();
    try {
      await maintenance.query('BEGIN');
      const expired=await expireAbandonedTransfers(maintenance,{batchSize:10});
      assert.equal(expired.expiredCount,1);
      const finalState=await maintenance.query(`SELECT t.status,t.blocker_code,a.status AS approval_status,u.status AS limit_status
        FROM financial_service_transactions t JOIN financial_transaction_approvals a ON a.transaction_id=t.id
        JOIN financial_limit_utilization u ON u.transaction_id=t.id WHERE t.id=$1`,[txIds[2]]);
      assert.deepEqual(finalState.rows[0],{status:'FAILED',blocker_code:'APPROVAL_EXPIRED',approval_status:'CANCELLED',limit_status:'RELEASED'});
      await maintenance.query('ROLLBACK');
    } catch(error) { await maintenance.query('ROLLBACK').catch(()=>{}); throw error; }
    finally { maintenance.release(); }

    first=await pool.connect(); second=await pool.connect();
    await first.query('BEGIN');
    const firstResult=await reserveTransferLimit(first,{organizationId:orgId,userId:ownerId,serviceType:'BANK_TRANSFER',amountPaise:100,transactionId:txIds[0]});
    assert.equal(firstResult.ok,true);
    await second.query('BEGIN');
    const secondReservation=reserveTransferLimit(second,{organizationId:orgId,userId:ownerId,serviceType:'BANK_TRANSFER',amountPaise:100,transactionId:txIds[1]});
    await new Promise((resolve)=>setTimeout(resolve,50));
    await first.query('COMMIT');
    const secondResult=await secondReservation;
    assert.deepEqual(secondResult,{ok:false,blocker:'ORGANIZATION_DAILY_LIMIT_EXCEEDED'});
    await second.query('ROLLBACK');
  } finally {
    await first?.query('ROLLBACK').catch(()=>{}); first?.release();
    await second?.query('ROLLBACK').catch(()=>{}); second?.release();
    const cleanup=await pool.connect();
    try {
      await cleanup.query('BEGIN');
      await cleanup.query(`DELETE FROM financial_transaction_approvals WHERE organization_id=$1`,[orgId]);
      await cleanup.query(`DELETE FROM financial_limit_utilization WHERE transaction_id=ANY($1::uuid[])`,[txIds]);
      await cleanup.query(`DELETE FROM financial_service_transactions WHERE id=ANY($1::uuid[])`,[txIds]);
      await cleanup.query(`DELETE FROM financial_transaction_limits WHERE organization_id=$1`,[orgId]);
      await cleanup.query(`DELETE FROM financial_funding_sources WHERE id=$1`,[sourceId]);
      await cleanup.query(`DELETE FROM financial_beneficiaries WHERE id=$1`,[beneficiaryId]);
      await cleanup.query(`DELETE FROM financial_organization_members WHERE organization_id=$1`,[orgId]);
      await cleanup.query(`DELETE FROM financial_organization_members WHERE organization_id=$1`,[otherOrgId]);
      await cleanup.query(`DELETE FROM financial_merchant_organizations WHERE id=$1`,[orgId]);
      await cleanup.query(`DELETE FROM financial_merchant_organizations WHERE id=$1`,[otherOrgId]);
      await cleanup.query(`DELETE FROM customer_accounts WHERE id=ANY($1::uuid[])`,[[ownerId,checkerId]]);
      await cleanup.query('COMMIT');
    } catch(error) { await cleanup.query('ROLLBACK').catch(()=>{}); cleanupError=error; }
    finally { cleanup.release(); await pool.end(); }
  }
  if(cleanupError) throw cleanupError;
});
