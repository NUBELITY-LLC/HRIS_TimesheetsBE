import multer from 'multer';
import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/ApiError.js';
import {
  ALLOWED_EVIDENCE_TYPES,
  MAX_EVIDENCE_BYTES,
  type UploadedEvidence,
} from '../modules/approvals/approvals.storage.js';

const evidenceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_EVIDENCE_BYTES, files: 1 },
}).single('evidence');

export function acceptEvidence(req: Request, res: Response, next: NextFunction): void {
  evidenceUpload(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        next(
          new ApiError(422, 'La evidencia excede los 10 MB', 'EVIDENCE_TOO_LARGE', {
            max: MAX_EVIDENCE_BYTES,
          }),
        );
        return;
      }

      next(ApiError.badRequest('No fue posible leer el archivo adjunto'));
      return;
    }

    if (error) {
      next(error);
      return;
    }

    next();
  });
}

export function readEvidence(req: Request): UploadedEvidence | null {
  const file = req.file;
  if (!file) return null;

  if (!ALLOWED_EVIDENCE_TYPES.includes(file.mimetype)) {
    throw new ApiError(
      422,
      'La evidencia debe ser PDF, PNG, JPG o WEBP',
      'EVIDENCE_TYPE_NOT_ALLOWED',
      { mimeType: file.mimetype, allowed: ALLOWED_EVIDENCE_TYPES },
    );
  }

  return {
    originalName: file.originalname.slice(0, 255),
    mimeType: file.mimetype,
    size: file.size,
    buffer: file.buffer,
  };
}
