export function loginFailurePresentation(status, reasonCode, retryAfterSeconds) {
  if (status === 401) return { message: 'Email ya password galat hai.' };
  if (status === 429) {
    const minutes = Math.max(1, Math.ceil((retryAfterSeconds || 900) / 60));
    return { message: `Bahut zyada koshishein hui hain. ${minutes} minute baad dobara try karein.` };
  }
  if (status === 403) {
    if (reasonCode === 'VERIFICATION_REQUIRED') return { message: 'Email aur mobile verify karein. Verification page par bhej rahe hain.', redirect: '/auth/verify' };
    if (reasonCode === 'ACCESS_PENDING') return { message: 'Aapka transaction access abhi pending hai. Account owner se approval lein.' };
    if (reasonCode === 'ACCOUNT_INACTIVE' || reasonCode === 'ACCOUNT_RESTRICTED') return { message: 'Yeh account abhi sign in nahi kar sakta. Support se sampark karein.' };
    return { message: 'Is account ko sign in ki anumati nahi hai.' };
  }
  return { message: 'Service abhi uplabdh nahi hai, dobara try karein.' };
}
