export async function expireAbandonedTransfers(db, { now = new Date(), batchSize = 100 } = {}) {
  const boundedBatch = Math.max(1, Math.min(500, Number(batchSize) || 100));
  const { rows } = await db.query(`SELECT id,user_id,organization_id,status
    FROM financial_service_transactions
    WHERE service_type IN ('DMT','BANK_TRANSFER')
      AND status IN ('DRAFT','AUTHORIZATION_PENDING')
      AND expires_at IS NOT NULL AND expires_at <= $1
    ORDER BY expires_at
    LIMIT $2
    FOR UPDATE SKIP LOCKED`, [now, boundedBatch]);
  for (const transaction of rows) {
    const reasonCode = transaction.status === 'AUTHORIZATION_PENDING' ? 'APPROVAL_EXPIRED' : 'DRAFT_EXPIRED';
    await db.query(`UPDATE financial_service_transactions
      SET status='FAILED',blocker_code=$2,updated_at=$3,completed_at=$3
      WHERE id=$1`, [transaction.id, reasonCode, now]);
    await db.query(`INSERT INTO financial_service_transaction_history
      (transaction_id,from_status,to_status,actor_user_id,reason_code)
      VALUES($1,$2,'FAILED',NULL,$3)`, [transaction.id, transaction.status, reasonCode]);
    const approvals = await db.query(`UPDATE financial_transaction_approvals
      SET status='CANCELLED',decision_reason=$2,decided_at=$3
      WHERE transaction_id=$1 AND status='PENDING'
      RETURNING id,organization_id`, [transaction.id, reasonCode, now]);
    for (const approval of approvals.rows) {
      await db.query(`INSERT INTO financial_approval_history
        (approval_id,organization_id,actor_user_id,action,reason)
        VALUES($1,$2,NULL,'CANCELLED',$3)`, [approval.id, approval.organization_id, reasonCode]);
      if (approval.organization_id) await db.query(`INSERT INTO financial_organization_audit_events
        (organization_id,actor_user_id,event_type,target_type,target_id,reason_code)
        VALUES($1,NULL,'TRANSFER_APPROVAL_EXPIRED','TRANSFER_APPROVAL',$2,$3)`, [approval.organization_id, approval.id, reasonCode]);
    }
    await db.query(`UPDATE financial_limit_utilization SET status='RELEASED',updated_at=$2
      WHERE transaction_id=$1 AND status='RESERVED'`, [transaction.id, now]);
    await db.query(`INSERT INTO financial_operations_audit_events
      (actor_user_id,event_type,target_type,target_id,reason_code,safe_metadata)
      VALUES(NULL,'TRANSFER_EXPIRED','SERVICE_TRANSACTION',$1,$2,'{}'::jsonb)`, [transaction.id, reasonCode]);
  }
  return { expiredCount: rows.length };
}
