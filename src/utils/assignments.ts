export const RATE_PERIODS = ['HOUR', 'MONTH', 'YEAR'] as const;

export type RatePeriod = (typeof RATE_PERIODS)[number];

export const DEFAULT_RATE_PERIOD: RatePeriod = 'MONTH';

export const CURRENCY_CODES = [
  'USD',
  'MXN',
  'GTQ',
  'HNL',
  'NIO',
  'CRC',
  'PAB',
  'CUP',
  'DOP',
  'HTG',
  'COP',
  'VES',
  'PEN',
  'BOB',
  'CLP',
  'ARS',
  'UYU',
  'PYG',
  'BRL',
] as const;

export type CurrencyCode = (typeof CURRENCY_CODES)[number];

export const DEFAULT_CURRENCY: CurrencyCode = 'USD';
