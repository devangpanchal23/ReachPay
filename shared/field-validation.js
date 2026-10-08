export function emailError(value) {
  const email = typeof value === 'string' ? value.trim().normalize('NFKC') : '';
  const parts = email.split('@');
  const local = parts.length === 2 ? parts[0] : '';
  const domain = parts.length === 2 ? parts[1] : '';
  const localValid = local.length > 0 && local.length <= 64 && /^(?!\.)(?!.*\.\.)[A-Z0-9!#$%&'*+/=?^_`{|}~.-]+$/i.test(local) && !local.endsWith('.');
  const labels = domain.split('.');
  const domainValid = labels.length >= 2 && labels.every((label) => label.length > 0 && label.length <= 63 && /^[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?$/i.test(label)) && labels.at(-1).length >= 2;
  return email.length > 254 || !localValid || !domainValid
    ? 'Enter a valid email address.'
    : '';
}

export function nameError(value) {
  const name = typeof value === 'string' ? value.trim().normalize('NFKC') : '';
  const hasControl = [...name].some((char) => { const code = char.charCodeAt(0); return code < 32 || code === 127; });
  return name.length < 2 || name.length > 100 || /[<>]/.test(name) || hasControl
    ? 'Enter your name using 2 to 100 characters.'
    : '';
}

export function sanitizeNameInput(value) {
  return Array.from(String(value || '')).filter((char) => {
    const code = char.charCodeAt(0);
    return char !== '<' && char !== '>' && code >= 32 && code !== 127;
  }).slice(0, 100).join('');
}

export function passwordError(value) {
  return typeof value !== 'string' || value.length < 12 || value.length > 128
    ? 'Use a password between 12 and 128 characters.'
    : '';
}
