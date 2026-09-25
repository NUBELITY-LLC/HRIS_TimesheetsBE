import { logger } from '../../config/logger.js';
import { ApiError } from '../../utils/ApiError.js';
import * as repository from './holidays.repository.js';
import type { CreateHolidayInput, ListHolidaysQuery } from './holidays.schema.js';

export type HolidayView = {
  id: number;
  countryCode: string;
  date: string;
  name: string;
};

function toView(record: repository.HolidayRecord): HolidayView {
  return {
    id: record.id,
    countryCode: record.country_code,
    date: record.holiday_date,
    name: record.name,
  };
}

export async function listHolidays(query: ListHolidaysQuery): Promise<HolidayView[]> {
  const records = await repository.findHolidays({
    countryCode: query.countryCode,
    from: `${query.year}-01-01`,
    to: `${query.year}-12-31`,
  });

  return records.map(toView);
}

export async function createHoliday(
  input: CreateHolidayInput,
  actorId: number,
): Promise<HolidayView> {
  const record = await repository.insertHoliday({
    country_code: input.countryCode,
    holiday_date: input.date,
    name: input.name,
  });

  logger.info(
    { holidayId: record.id, date: record.holiday_date, createdBy: actorId },
    'Dia festivo agregado',
  );

  return toView(record);
}

export async function deleteHoliday(id: number, actorId: number): Promise<HolidayView> {
  const record = await repository.deleteHoliday(id);

  if (!record) {
    throw ApiError.notFound('El dia festivo no existe');
  }

  logger.info(
    { holidayId: id, date: record.holiday_date, deletedBy: actorId },
    'Dia festivo eliminado',
  );

  return toView(record);
}
