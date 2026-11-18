export const MAX_EMAIL_DOMAINS = 20;

const DOMAIN_PATTERN = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function normalizeEmailDomain(value: string): string {
  return value.trim().toLowerCase().replace(/^@+/, '');
}

export function isValidEmailDomain(value: string): boolean {
  return DOMAIN_PATTERN.test(value);
}

export function emailDomainOf(email: string): string {
  return email.slice(email.lastIndexOf('@') + 1).trim().toLowerCase();
}

export function isEmailAllowed(email: string, domains: readonly string[]): boolean {
  return domains.length === 0 || domains.includes(emailDomainOf(email));
}
