export const CONTRACT_TYPES = ['CONTRACTOR', 'PAYROLL'] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];

import type { CountryCode } from '../../utils/countries.js';
import type { RatePeriod } from '../../utils/assignments.js';

export const PAY_BUCKETS = ['REGULAR', 'SUNDAY', 'OVERTIME', 'OVERTIME_TRIPLE', 'HOLIDAY'] as const;
export type PayBucket = (typeof PAY_BUCKETS)[number];

export const DEFAULT_PAY_TERMS = {
  contractType: 'CONTRACTOR' as ContractType,
  countryCode: 'MX' as CountryCode,
  hoursDivisor: 240,
  dailyHours: 8,
  overtimeMultiplier: 2,
  holidayMultiplier: 2,
};

export type PayrollRules = {
  overtimeMultiplier: number;
  overtimeTripleMultiplier: number;
  weeklyDoubleOvertimeHours: number | null;
  holidayMultiplier: number;
  sundayMultiplier: number;
};

export const DEFAULT_PAYROLL_RULES: PayrollRules = {
  overtimeMultiplier: 2,
  overtimeTripleMultiplier: 3,
  weeklyDoubleOvertimeHours: null,
  holidayMultiplier: 2,
  sundayMultiplier: 1,
};

export type RateChange = {
  effectiveFrom: string;
  payRate: number;
  ratePeriod: RatePeriod;
};

export type PayTerms = {
  payRate: number;
  ratePeriod: RatePeriod;
  rateChanges?: RateChange[];
  contractType: ContractType;
  countryCode: CountryCode;
  hoursDivisor: number;
  dailyHours: number;
  overtimeMultiplier: number;
  holidayMultiplier: number;
};

export type PayDayInput = { date: string; minutes: number };

export type PayLine = {
  bucket: PayBucket;
  minutes: number;
  hours: number;
  multiplier: number;
  hourlyRate: number;
  amount: number;
};

export type RatePeriodSpan = {
  from: string;
  hourlyRate: number;
};

export type DayPay = {
  date: string;
  minutes: number;
  hourlyRate: number;
  amount: number;
  lines: PayLine[];
};

export type PayBreakdown = {
  contractType: ContractType;
  countryCode: CountryCode;
  hourlyRate: number;
  rates: RatePeriodSpan[];
  minutes: number;
  hours: number;
  amount: number;
  lines: PayLine[];
  days: DayPay[];
};

type Portion = { bucket: PayBucket; minutes: number; multiplier: number };

function cents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function hoursOf(minutes: number): number {
  return Number((minutes / 60).toFixed(2));
}

function isSunday(isoDate: string): boolean {
  return new Date(`${isoDate}T00:00:00.000Z`).getUTCDay() === 0;
}

const MONTHS_PER_YEAR = 12;

export function rateOn(
  terms: Pick<PayTerms, 'payRate' | 'ratePeriod' | 'rateChanges'>,
  isoDate: string,
): Pick<PayTerms, 'payRate' | 'ratePeriod'> {
  const change = (terms.rateChanges ?? [])
    .filter((candidate) => candidate.effectiveFrom <= isoDate)
    .sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom))[0];

  return change
    ? { payRate: change.payRate, ratePeriod: change.ratePeriod }
    : { payRate: terms.payRate, ratePeriod: terms.ratePeriod };
}

export function hourlyRateFor(
  terms: Pick<PayTerms, 'payRate' | 'ratePeriod' | 'hoursDivisor'>,
): number {
  if (terms.ratePeriod === 'HOUR') return terms.payRate;
  if (terms.hoursDivisor <= 0) return 0;

  const divisor =
    terms.ratePeriod === 'YEAR' ? terms.hoursDivisor * MONTHS_PER_YEAR : terms.hoursDivisor;
  return Number((terms.payRate / divisor).toFixed(4));
}

function contractorPortions(
  day: PayDayInput,
  terms: PayTerms,
  holidays: ReadonlySet<string>,
): Portion[] {
  if (holidays.has(day.date)) {
    return [
      {
        bucket: 'HOLIDAY',
        minutes: day.minutes,
        multiplier: terms.holidayMultiplier,
      },
    ];
  }

  const regular = Math.min(day.minutes, terms.dailyHours * 60);

  return [
    { bucket: 'REGULAR', minutes: regular, multiplier: 1 },
    {
      bucket: 'OVERTIME',
      minutes: day.minutes - regular,
      multiplier: terms.overtimeMultiplier,
    },
  ];
}

function payrollPortions(
  day: PayDayInput,
  terms: PayTerms,
  rules: PayrollRules,
  holidays: ReadonlySet<string>,
  overtimeUsed: { minutes: number },
): Portion[] {
  if (holidays.has(day.date)) {
    return [
      {
        bucket: 'HOLIDAY',
        minutes: day.minutes,
        multiplier: rules.holidayMultiplier,
      },
    ];
  }

  const regular = Math.min(day.minutes, terms.dailyHours * 60);
  const extra = day.minutes - regular;
  const doubleAvailable = Math.max(
    0,
    rules.weeklyDoubleOvertimeHours === null
      ? Number.POSITIVE_INFINITY
      : rules.weeklyDoubleOvertimeHours * 60 - overtimeUsed.minutes,
  );
  const double = Math.min(extra, doubleAvailable);
  overtimeUsed.minutes += extra;

  const sunday = isSunday(day.date) && rules.sundayMultiplier !== 1;

  return [
    {
      bucket: sunday ? 'SUNDAY' : 'REGULAR',
      minutes: regular,
      multiplier: sunday ? rules.sundayMultiplier : 1,
    },
    {
      bucket: 'OVERTIME',
      minutes: double,
      multiplier: rules.overtimeMultiplier,
    },
    {
      bucket: 'OVERTIME_TRIPLE',
      minutes: extra - double,
      multiplier: rules.overtimeTripleMultiplier,
    },
  ];
}

function toLine(portion: Portion, hourlyRate: number): PayLine {
  return {
    bucket: portion.bucket,
    minutes: portion.minutes,
    hours: hoursOf(portion.minutes),
    multiplier: portion.multiplier,
    hourlyRate,
    amount: cents((portion.minutes / 60) * hourlyRate * portion.multiplier),
  };
}

function mergeLines(lines: PayLine[]): PayLine[] {
  const merged = new Map<string, PayLine>();

  for (const line of lines) {
    const key = `${line.bucket}:${line.multiplier}:${line.hourlyRate}`;
    const current = merged.get(key);
    merged.set(
      key,
      current
        ? {
            ...current,
            minutes: current.minutes + line.minutes,
            hours: hoursOf(current.minutes + line.minutes),
            amount: cents(current.amount + line.amount),
          }
        : line,
    );
  }

  return [...merged.values()].sort(
    (left, right) =>
      PAY_BUCKETS.indexOf(left.bucket) - PAY_BUCKETS.indexOf(right.bucket) ||
      left.hourlyRate - right.hourlyRate,
  );
}

export function computePay(params: {
  terms: PayTerms;
  days: PayDayInput[];
  holidays: ReadonlySet<string>;
  payrollRules?: PayrollRules;
}): PayBreakdown {
  const { terms, holidays } = params;
  const overtimeUsed = { minutes: 0 };

  const days = [...params.days]
    .filter((day) => day.minutes > 0)
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((day): DayPay => {
      const hourlyRate = hourlyRateFor({ ...terms, ...rateOn(terms, day.date) });
      const portions =
        terms.contractType === 'PAYROLL'
          ? payrollPortions(
              day,
              terms,
              params.payrollRules ?? DEFAULT_PAYROLL_RULES,
              holidays,
              overtimeUsed,
            )
          : contractorPortions(day, terms, holidays);

      const lines = portions
        .filter((portion) => portion.minutes > 0)
        .map((portion) => toLine(portion, hourlyRate));

      return {
        date: day.date,
        minutes: day.minutes,
        hourlyRate,
        amount: cents(lines.reduce((total, line) => total + line.amount, 0)),
        lines,
      };
    });

  const minutes = days.reduce((total, day) => total + day.minutes, 0);
  const lastDay = days[days.length - 1];
  const rates = days.reduce<RatePeriodSpan[]>((spans, day) => {
    const previous = spans[spans.length - 1];
    return previous && previous.hourlyRate === day.hourlyRate
      ? spans
      : [...spans, { from: day.date, hourlyRate: day.hourlyRate }];
  }, []);

  return {
    contractType: terms.contractType,
    countryCode: terms.countryCode,
    hourlyRate: lastDay ? lastDay.hourlyRate : hourlyRateFor(terms),
    rates,
    minutes,
    hours: hoursOf(minutes),
    amount: cents(days.reduce((total, day) => total + day.amount, 0)),
    lines: mergeLines(days.flatMap((day) => day.lines)),
    days,
  };
}
