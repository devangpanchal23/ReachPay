export function toPaise(amount) {
  const value = String(amount).trim();
  if (!/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(value)) throw new RangeError('Amount must be a positive INR value with at most two decimal places.');
  const [rupees, fraction = ''] = value.split('.');
  const paise = Number(rupees) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(paise) || paise < 100) throw new RangeError('Minimum amount is ₹1.00.');
  return paise;
}

export function formatINR(paise) {
  if (!Number.isSafeInteger(paise)) throw new TypeError('Money must be an integer paise amount.');
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(paise / 100);
}

export function assertBalanced(entries) {
  if (!Array.isArray(entries) || entries.length < 2 || entries.some((entry) => !Number.isSafeInteger(entry.deltaPaise))) {
    throw new TypeError('A journal needs at least two integer-paise postings.');
  }
  if (entries.reduce((sum, entry) => sum + entry.deltaPaise, 0) !== 0) throw new Error('Ledger journal is not balanced.');
  return true;
}
