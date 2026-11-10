import { supabase } from '../config/supabase.js';
import { logger } from '../config/logger.js';
import { ApiError } from './ApiError.js';
import type { Json } from '../types/database.types.js';

export type DataExportKind =
  | 'TIMESHEET'
  | 'APPROVAL_TIMESHEET'
  | 'TIMESHEET_EVIDENCE'
  | 'APPROVAL_EVIDENCE'
  | 'HOURS_REPORT'
  | 'COMPANY_REPORT'
  | 'AUDIT'
  | 'FEEDBACK_REPORT'
  | 'FEEDBACK_CASES';

function cleanFilters(filters: Record<string, unknown>): Json {
  const result: Record<string, Json> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    result[key] = value as Json;
  }
  return result;
}

export async function recordDataExport(params: {
  kind: DataExportKind;
  label: string;
  records?: number | null;
  format?: string | null;
  filters?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await supabase.rpc('fn_log_data_export', {
    p_kind: params.kind,
    p_label: params.label.slice(0, 300),
    p_records: params.records ?? null,
    p_format: params.format ?? null,
    p_filters: cleanFilters(params.filters ?? {}),
  });

  if (error) {
    logger.error({ err: error, kind: params.kind }, 'No fue posible registrar la descarga');
    throw ApiError.internal('No fue posible completar la descarga, intenta de nuevo');
  }
}
