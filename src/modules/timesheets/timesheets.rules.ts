export const MINUTE_STEP = 15;
export const ACTIVITY_MIN_MINUTES = 15;
export const ACTIVITY_MAX_MINUTES = 8 * 60;
export const DAY_MAX_MINUTES = 24 * 60;

export const WEEK_LENGTH = 7;

export function minutesToHours(value: number): number {
  return Number((value / 60).toFixed(2));
}

export function hoursToMinutes(value: number): number {
  return Math.round(Number(value) * 60);
}

export function formatMinutes(value: number): string {
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

function utcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function isMonday(isoDate: string): boolean {
  return utcDate(isoDate).getUTCDay() === 1;
}

export function addDays(isoDate: string, days: number): string {
  const date = utcDate(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function weekEndOf(weekStart: string): string {
  return addDays(weekStart, WEEK_LENGTH - 1);
}

export function isWithinWeek(isoDate: string, weekStart: string): boolean {
  return isoDate >= weekStart && isoDate <= weekEndOf(weekStart);
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function currentWeekStartISO(): string {
  const today = todayISO();
  return addDays(today, -((utcDate(today).getUTCDay() + 6) % 7));
}
