import { PDFDocument, PDFName } from 'pdf-lib';
import { ApiError } from '../../utils/ApiError.js';
import type { UploadedEvidence } from '../approvals/approvals.storage.js';

function unreadable(): ApiError {
  return new ApiError(
    422,
    'No fue posible procesar uno de los archivos, intenta con otro',
    'EVIDENCE_UNREADABLE',
  );
}

function startsWith(buffer: Buffer, signature: number[], offset = 0): boolean {
  return signature.every((byte, index) => buffer[offset + index] === byte);
}

function detectType(buffer: Buffer): string | null {
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  if (buffer.toString('ascii', 0, 5) === '%PDF-') return 'application/pdf';
  return null;
}

const JPEG_KEPT_APP_MARKERS = new Set([0xe0, 0xee]);

function stripJpeg(buffer: Buffer): Buffer {
  const parts: Buffer[] = [buffer.subarray(0, 2)];
  let offset = 2;

  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) throw unreadable();

    const marker = buffer[offset + 1]!;
    if (marker === 0xff) {
      offset += 1;
      continue;
    }

    if (marker === 0xda) {
      parts.push(buffer.subarray(offset));
      return Buffer.concat(parts);
    }

    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(buffer.subarray(offset, offset + 2));
      offset += 2;
      continue;
    }

    const length = buffer.readUInt16BE(offset + 2);
    const end = offset + 2 + length;
    if (length < 2 || end > buffer.length) throw unreadable();

    const isApp = marker >= 0xe0 && marker <= 0xef;
    const isComment = marker === 0xfe;
    const keep = isApp ? JPEG_KEPT_APP_MARKERS.has(marker) : !isComment;

    if (keep) parts.push(buffer.subarray(offset, end));
    offset = end;
  }

  throw unreadable();
}

const PNG_DROPPED_CHUNKS = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);

function stripPng(buffer: Buffer): Buffer {
  const parts: Buffer[] = [buffer.subarray(0, 8)];
  let offset = 8;

  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const end = offset + 12 + length;
    if (end > buffer.length) throw unreadable();

    if (!PNG_DROPPED_CHUNKS.has(type)) parts.push(buffer.subarray(offset, end));
    offset = end;

    if (type === 'IEND') return Buffer.concat(parts);
  }

  throw unreadable();
}

const WEBP_DROPPED_CHUNKS = new Set(['EXIF', 'XMP ']);
const VP8X_EXIF_FLAG = 0x08;
const VP8X_XMP_FLAG = 0x04;

function stripWebp(buffer: Buffer): Buffer {
  const riffEnd = Math.min(buffer.length, 8 + buffer.readUInt32LE(4));
  const chunks: Buffer[] = [];
  let offset = 12;

  while (offset + 8 <= riffEnd) {
    const type = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const end = offset + 8 + size + (size % 2);
    if (offset + 8 + size > riffEnd) throw unreadable();

    if (!WEBP_DROPPED_CHUNKS.has(type)) {
      const chunk = Buffer.from(buffer.subarray(offset, Math.min(end, riffEnd)));
      if (type === 'VP8X' && chunk.length > 8) {
        chunk[8] = chunk[8]! & ~(VP8X_EXIF_FLAG | VP8X_XMP_FLAG);
      }
      chunks.push(chunk);
    }
    offset = end;
  }

  if (!chunks.length) throw unreadable();

  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(body.length + 4, 4);
  header.write('WEBP', 8, 'ascii');
  return Buffer.concat([header, body]);
}

async function stripPdf(buffer: Buffer): Promise<Buffer> {
  let document: PDFDocument;
  try {
    document = await PDFDocument.load(buffer, { updateMetadata: false });
  } catch {
    throw unreadable();
  }

  document.catalog.delete(PDFName.of('Metadata'));
  for (const page of document.getPages()) {
    page.node.delete(PDFName.of('Metadata'));
  }
  document.context.trailerInfo.Info = undefined;
  document.context.trailerInfo.ID = undefined;

  return Buffer.from(await document.save({ useObjectStreams: true, updateFieldAppearances: false }));
}

export async function sanitizeEvidence(file: UploadedEvidence): Promise<UploadedEvidence> {
  const detected = detectType(file.buffer);
  if (!detected || detected !== file.mimeType) throw unreadable();

  let buffer: Buffer;
  try {
    if (detected === 'image/jpeg') buffer = stripJpeg(file.buffer);
    else if (detected === 'image/png') buffer = stripPng(file.buffer);
    else if (detected === 'image/webp') buffer = stripWebp(file.buffer);
    else buffer = await stripPdf(file.buffer);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw unreadable();
  }

  return { originalName: '', mimeType: detected, size: buffer.length, buffer };
}
