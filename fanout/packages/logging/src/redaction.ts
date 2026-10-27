const secretKeyPattern = /(token|secret|password|authorization|api[-_]?key|client[-_]?secret|code[-_]?verifier|cookie|signature|credential)/i;
const secretQueryParameterPattern = /([?&](?:access_token|refresh_token|client_secret|code|api_key|key|signature|token)=)[^&#]*/gi;

export const redactedPlaceholder = '[REDACTED]';

export function isSecretKey(key: string): boolean {
  return secretKeyPattern.test(key);
}

export function redactUrl(url: string): string {
  return url.replace(secretQueryParameterPattern, `$1${redactedPlaceholder}`);
}

/** Deep-copies a value with every secret-looking field replaced; safe to log or persist in the audit log. */
export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (typeof value === 'string') return redactUrl(value);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, isSecretKey(key) ? redactedPlaceholder : redactSecrets(entry)]),
  );
}
