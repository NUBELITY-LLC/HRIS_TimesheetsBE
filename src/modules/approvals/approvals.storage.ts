import { randomUUID } from 'node:crypto';
import { supabase } from '../../config/supabase.js';
import { logger } from '../../config/logger.js';
import { ApiError } from '../../utils/ApiError.js';

export const EVIDENCE_BUCKET = 'timesheet-evidence';
export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_EVIDENCE_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
];

export type UploadedEvidence = {
  originalName: string;
  mimeType: string;
  size: number;
  buffer: Buffer;
};

const EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export function assertEvidenceAllowed(file: UploadedEvidence): void {
  if (!ALLOWED_EVIDENCE_TYPES.includes(file.mimeType)) {
    throw new ApiError(
      422,
      'La evidencia debe ser PDF, PNG, JPG o WEBP',
      'EVIDENCE_TYPE_NOT_ALLOWED',
      { mimeType: file.mimeType, allowed: ALLOWED_EVIDENCE_TYPES },
    );
  }

  if (file.size <= 0 || file.size > MAX_EVIDENCE_BYTES) {
    throw new ApiError(422, 'La evidencia excede los 10 MB', 'EVIDENCE_TOO_LARGE', {
      size: file.size,
      max: MAX_EVIDENCE_BYTES,
    });
  }
}

export function evidencePath(timesheetId: number, approvalId: number, file: UploadedEvidence): string {
  const extension = EXTENSIONS[file.mimeType] ?? 'bin';
  return `${timesheetId}/${approvalId}/${randomUUID()}.${extension}`;
}

export async function uploadEvidence(path: string, file: UploadedEvidence): Promise<void> {
  const { error } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .upload(path, file.buffer, { contentType: file.mimeType, upsert: false });

  if (error) {
    logger.error({ err: error, path }, 'Fallo al subir la evidencia de aprobacion');
    throw ApiError.internal('No fue posible guardar la evidencia, intenta de nuevo');
  }
}

export async function removeEvidence(path: string): Promise<void> {
  const { error } = await supabase.storage.from(EVIDENCE_BUCKET).remove([path]);

  if (error) {
    logger.error({ err: error, path }, 'Fallo al descartar la evidencia huerfana');
  }
}

export async function signEvidence(path: string, expiresInSeconds = 300): Promise<string> {
  const { data, error } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    logger.error({ err: error, path }, 'Fallo al firmar la descarga de la evidencia');
    throw ApiError.internal('No fue posible generar el enlace de la evidencia');
  }

  return data.signedUrl;
}
