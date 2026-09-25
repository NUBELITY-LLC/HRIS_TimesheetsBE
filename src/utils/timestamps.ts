const HAS_ZONE = /(?:Z|[+-]\d{2}:?\d{2})$/;

export function parseDbTimestamp(value: string): Date {
  return new Date(HAS_ZONE.test(value) ? value : `${value}Z`);
}
