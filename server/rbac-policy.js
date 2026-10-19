export function hasTransactionAccess(user) {
  if (!user || user.status !== 'ACTIVE' || !user.email_verified_at || !user.mobile_verified_at) return false;
  if (user.role === 'owner') return true;
  return ['member', 'approved_member'].includes(user.role) && user.access_status === 'approved';
}

export function canManageTeam(user) {
  return Boolean(user && user.status === 'ACTIVE' && user.email_verified_at && user.mobile_verified_at && user.role === 'owner');
}

export function hasCompletedLoginVerification(user) {
  return Boolean(user && user.status === 'ACTIVE' && user.email_verified_at && user.mobile_verified_at);
}

export function resolveEffectiveRole(user) {
  if (!user) return null;
  if (!user.email_verified_at || !user.mobile_verified_at) return { ...user, role: 'limited', access_status: 'limited' };
  if (user.role === 'owner' && user.status === 'ACTIVE') {
    return { ...user, role: 'owner', access_status: 'approved' };
  }
  if (user.role === 'owner') return { ...user, role: 'limited', access_status: 'limited' };
  if (user.role === 'member' && user.access_status === 'approved') return user;
  if (user.role === 'approved_member' && user.access_status === 'approved') return { ...user, role: 'member' };
  if (['member', 'approved_member'].includes(user.role)) return { ...user, role: 'member', access_status: user.access_status || 'pending' };
  if (user.role === 'limited') return user;
  return { ...user, role: 'limited', access_status: user.access_status || 'limited' };
}

export function memberTransition(action, currentRole) {
  if (currentRole === 'owner') return null;
  if (action === 'approve') return { role: 'member', status: 'approved' };
  if (action === 'revoke') return { role: 'member', status: 'revoked' };
  return null;
}

export function mayRemoveAccount(role) {
  return role !== 'owner';
}

export function mayAssignOwner(existingOwnerCount) {
  return Number.isInteger(existingOwnerCount) && existingOwnerCount >= 0;
}
