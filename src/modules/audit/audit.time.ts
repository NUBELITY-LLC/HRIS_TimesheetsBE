export const AUDIT_TIME_ZONE = 'America/Mexico_City';

function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const part = (type: string) => Number(parts.find((candidate) => candidate.type === type)?.value);

  const asUtc = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
    part('second'),
  );

  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

export function zonedDayStart(isoDate: string, timeZone: string): Date {
  const guess = new Date(`${isoDate}T00:00:00.000Z`);
  return new Date(guess.getTime() - zoneOffsetMs(guess, timeZone));
}

export function nextDay(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function dbTimestamp(instant: Date): string {
  return instant.toISOString().slice(0, 23);
}

export function zonedWallClock(instant: Date, timeZone = AUDIT_TIME_ZONE): Date {
  return new Date(instant.getTime() + zoneOffsetMs(instant, timeZone));
}
