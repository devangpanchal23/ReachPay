export function hasTransactionAccess(user) {
  if (!user || user.status !== 'ACTIVE' || !user.email_verified_at || !user.mobile_verified_at) return false;
  if (user.role === 'owner') return true;
  return user.role === 'approved_member' && user.access_status === 'approved';
}

export function canManageTeam(user) {
  return Boolean(user && user.status === 'ACTIVE' && user.email_verified_at && user.mobile_verified_at && user.role === 'owner');
}

export function hasCompletedLoginVerification(user) {
  return Boolean(user && user.status === 'ACTIVE' && user.email_verified_at && user.mobile_verified_at);
}

export function resolveEffectiveRole(user, ownerEmail, hasConflictingOwner = false) {
  if (!user) return null;
  const configuredEmail = String(ownerEmail || '').trim().toLowerCase();
  const accountEmail = String(user.email || '').trim().toLowerCase();
  if (!user.email_verified_at || !user.mobile_verified_at) return { ...user, role: 'limited', access_status: 'limited' };
  const verifiedOwner = Boolean(configuredEmail && accountEmail === configuredEmail && user.email_verified_at && user.status === 'ACTIVE');
  const storedOwnerIsConfigured = user.role !== 'owner' || accountEmail === configuredEmail;

  if (verifiedOwner && storedOwnerIsConfigured && !hasConflictingOwner) {
    return { ...user, role: 'owner', access_status: 'approved' };
  }
  if (user.role === 'owner') return { ...user, role: 'limited', access_status: 'limited' };
  if (user.role === 'approved_member' && user.access_status === 'approved') return user;
  return { ...user, role: 'limited' };
}

export function memberTransition(action, currentRole) {
  if (currentRole === 'owner') return null;
  if (action === 'approve') return { role: 'approved_member', status: 'approved' };
  if (action === 'revoke') return { role: 'limited', status: 'revoked' };
  return null;
}

export function mayRemoveAccount(role) {
  return role !== 'owner';
}

export function mayAssignOwner(existingOwnerCount) {
  return existingOwnerCount === 0;
}
