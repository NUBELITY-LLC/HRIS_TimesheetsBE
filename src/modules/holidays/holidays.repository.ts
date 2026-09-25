import { supabase } from '../../config/supabase.js';
import { logger } from '../../config/logger.js';
import { ApiError } from '../../utils/ApiError.js';

export type HolidayRecord = {
  id: number;
  country_code: string;
  holiday_date: string;
  name: string;
};

const COLUMNS = 'id, country_code, holiday_date, name';
const UNIQUE_VIOLATION = '23505';

function fail(operation: string, error: unknown): never {
  logger.error({ err: error, operation }, 'Fallo de acceso a datos en el modulo holidays');
  throw ApiError.internal('No fue posible completar la operacion, intenta de nuevo');
}

export async function findHolidays(params: {
  countryCode: string;
  from: string;
  to: string;
}): Promise<HolidayRecord[]> {
  const { data, error } = await supabase
    .from('HOLIDAYS')
    .select(COLUMNS)
    .eq('country_code', params.countryCode)
    .gte('holiday_date', params.from)
    .lte('holiday_date', params.to)
    .order('holiday_date', { ascending: true });

  if (error) fail('findHolidays', error);

  return data ?? [];
}

export async function insertHoliday(row: Omit<HolidayRecord, 'id'>): Promise<HolidayRecord> {
  const { data, error } = await supabase.from('HOLIDAYS').insert(row).select(COLUMNS).single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throw ApiError.conflict('Ya hay un dia festivo registrado en esa fecha');
    }
    fail('insertHoliday', error);
  }

  return data;
}

export async function deleteHoliday(id: number): Promise<HolidayRecord | null> {
  const { data, error } = await supabase
    .from('HOLIDAYS')
    .delete()
    .eq('id', id)
    .select(COLUMNS)
    .maybeSingle();

  if (error) fail('deleteHoliday', error);

  return data ?? null;
}
