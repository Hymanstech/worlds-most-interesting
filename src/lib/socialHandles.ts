export function normalizeSocialHandle(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';

  const withoutProtocol = trimmed.replace(/^https?:\/\//i, '');
  const withoutHost = withoutProtocol.replace(/^(www\.)?(instagram\.com|x\.com|twitter\.com)\//i, '');
  const firstSegment = withoutHost.split(/[/?#]/)[0] || '';

  return firstSegment.replace(/^@+/, '').trim();
}

export function formatHandle(value: string): string {
  const normalized = normalizeSocialHandle(value);
  return normalized ? `@${normalized}` : '';
}
