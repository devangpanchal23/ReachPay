export function isTransactionPath(path) {
  return /^\/(?:pos(?:-machine|-wallet)?|wallet|banking|bank-transfers|beneficiaries|dmt|bbps|recharge|transfers)(?:\/|$)/i.test(path)
    || /^\/dashboard\/(?:pos(?:-machine|-wallet)?|wallet|banking|bank-transfers|beneficiaries|dmt|bbps|recharge|transfers)(?:\/|$)/i.test(path);
}

export function canOpenTransactionPath(path, user) {
  return !isTransactionPath(path) || Boolean(user && ['owner', 'member', 'approved_member'].includes(user.role)
    && (user.role === 'owner' || user.accessStatus === 'approved'));
}

export function canOpenTeamAccessPage(user) {
  return Boolean(user && user.role === 'owner');
}
