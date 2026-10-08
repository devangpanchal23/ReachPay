const transitions = {
  payin: {
    INITIATED: ['PROCESSING', 'FAILED'], PROCESSING: ['PENDING_POS_CREDIT', 'FAILED'],
    PENDING_POS_CREDIT: ['CREDITED', 'FAILED', 'RECONCILIATION_REQUIRED'],
    RECONCILIATION_REQUIRED: ['CREDITED', 'FAILED'], CREDITED: ['REFUNDED'], FAILED: [], REFUNDED: []
  },
  settlement: {
    CREATED: ['BALANCE_HELD', 'FAILED'], BALANCE_HELD: ['SUBMITTED', 'FAILED'],
    SUBMITTED: ['SUCCESS', 'FAILED', 'REVERSED'], SUCCESS: ['REVERSED'], FAILED: ['REVERSED'], REVERSED: []
  }
};

export function assertTransition(flow, from, to, verifiedRecovery = false) {
  const allowed = transitions[flow]?.[from];
  if (!allowed) throw new RangeError(`Unknown ${flow} status: ${from}`);
  if (!allowed.includes(to)) {
    if (flow === 'payin' && from === 'FAILED' && to === 'CREDITED' && verifiedRecovery) return true;
    throw new Error(`Invalid ${flow} transition: ${from} -> ${to}`);
  }
  return true;
}

export function holdPayout(amountPaise, availablePaise) {
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0 || !Number.isSafeInteger(availablePaise)) throw new TypeError('Use positive integer paise values.');
  if (amountPaise > availablePaise) throw new RangeError('Insufficient available balance.');
  return availablePaise - amountPaise;
}
