import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { logger } from '../../config/logger.js';
import { ApiError } from '../../utils/ApiError.js';
import { parseDbTimestamp } from '../../utils/timestamps.js';
import {
  removeEvidence,
  signEvidence,
  uploadEvidence,
  type UploadedEvidence,
} from '../approvals/approvals.storage.js';
import { queueNotificationEmails } from '../notifications/notifications.emails.js';
import { feedbackCategoryLabel } from './feedback.export.js';
import { sanitizeEvidence } from './feedback.files.js';
import * as repository from './feedback.repository.js';
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_STATUSES,
  type AddFeedbackNoteInput,
  type FeedbackCategory,
  type FeedbackReportQuery,
  type FeedbackStatus,
  type ListFeedbackQuery,
  type SubmitFeedbackInput,
  type UpdateFeedbackStatusInput,
} from './feedback.schema.js';

const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_LENGTH = 16;
const EXCERPT_LENGTH = 180;

const EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export type FeedbackListItem = {
  id: number;
  category: FeedbackCategory;
  status: FeedbackStatus;
  submittedOn: string;
  excerpt: string;
  attachmentCount: number;
  noteCount: number;
};

export type FeedbackNoteView = {
  id: number;
  kind: 'INTERNAL' | 'REPLY';
  body: string;
  createdAt: string;
  author: { id: number | null; name: string } | null;
};

export type FeedbackCaseView = {
  id: number;
  category: FeedbackCategory;
  status: FeedbackStatus;
  submittedOn: string;
  body: string;
  resolution: string | null;
  statusChangedAt: string | null;
  attachments: { id: number; position: number; mimeType: string; sizeBytes: number; fileName: string }[];
  notes: FeedbackNoteView[];
};

export type FeedbackTrackingView = {
  category: FeedbackCategory;
  status: FeedbackStatus;
  submittedOn: string;
  resolution: string | null;
  replies: { body: string; createdAt: string }[];
};

export type FeedbackReportView = {
  total: number;
  byStatus: Record<FeedbackStatus, number>;
  byCategory: { category: FeedbackCategory; total: number; byStatus: Record<FeedbackStatus, number> }[];
  byMonth: { month: string; total: number }[];
};

function generateTrackingCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let code = '';
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    code += CODE_ALPHABET[bytes[index]! % CODE_ALPHABET.length];
  }
  return code.match(/.{4}/g)!.join('-');
}

function normalizeTrackingCode(code: string): string {
  return code.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

function hashTrackingCode(code: string): string {
  return createHash('sha256').update(normalizeTrackingCode(code)).digest('hex');
}

function attachmentName(position: number, mimeType: string): string {
  return `evidencia-${position}.${EXTENSIONS[mimeType] ?? 'bin'}`;
}

function toIso(value: string): string {
  return parseDbTimestamp(value).toISOString();
}

function emptyStatusCounts(): Record<FeedbackStatus, number> {
  return Object.fromEntries(FEEDBACK_STATUSES.map((status) => [status, 0])) as Record<
    FeedbackStatus,
    number
  >;
}

async function storeAttachments(reportId: number, files: UploadedEvidence[]): Promise<void> {
  const stored: string[] = [];

  try {
    const sanitized = await Promise.all(files.map(sanitizeEvidence));
    const rows = [];

    for (const [index, file] of sanitized.entries()) {
      const path = `feedback/${randomUUID()}.${EXTENSIONS[file.mimeType] ?? 'bin'}`;
      await uploadEvidence(path, file);
      stored.push(path);
      rows.push({
        report_id: reportId,
        position: index + 1,
        storage_path: path,
        mime_type: file.mimeType,
        size_bytes: file.size,
      });
    }

    await repository.insertAttachments(rows);
  } catch (error) {
    await Promise.all(stored.map((path) => removeEvidence(path)));
    throw error;
  }
}

async function notifyReviewers(reportId: number, category: FeedbackCategory): Promise<void> {
  const reviewers = await repository.findReviewerIds();
  await repository.notifyReviewers(reviewers, reportId, {
    title: 'Nuevo caso en el buzón anónimo',
    body: `Caso #${reportId} · ${feedbackCategoryLabel(category, 'es')}`,
  });
  if (reviewers.length) queueNotificationEmails({});
}

export async function submitFeedback(
  input: SubmitFeedbackInput,
  files: UploadedEvidence[],
): Promise<{ trackingCode: string }> {
  const trackingCode = generateTrackingCode();
  const reportId = await repository.insertReport({
    trackingHash: hashTrackingCode(trackingCode),
    category: input.category,
    body: input.body,
  });

  try {
    await storeAttachments(reportId, files);
  } catch (error) {
    await repository.deleteReport(reportId);
    throw error;
  }

  try {
    await notifyReviewers(reportId, input.category);
  } catch (error) {
    logger.error({ err: error }, 'No fue posible avisar a los revisores del buzon');
  }

  return { trackingCode };
}

export async function trackFeedback(code: string): Promise<FeedbackTrackingView> {
  const normalized = normalizeTrackingCode(code);
  const report =
    normalized.length === CODE_LENGTH
      ? await repository.findByTrackingHash(hashTrackingCode(normalized))
      : null;

  if (!report) {
    throw new ApiError(404, 'No encontramos un caso con ese folio', 'FEEDBACK_NOT_FOUND');
  }

  const replies = await repository.findNotes(report.id, ['REPLY']);

  return {
    category: report.category,
    status: report.status,
    submittedOn: report.submitted_on,
    resolution: report.status === 'RESOLVED' ? report.resolution : null,
    replies: replies.map((note) => ({ body: note.body, createdAt: toIso(note.created_at) })),
  };
}

export async function listFeedback(
  query: ListFeedbackQuery,
): Promise<{ items: FeedbackListItem[]; total: number }> {
  const { rows, total } = await repository.findReportPage(query, query.page, query.pageSize);

  return {
    total,
    items: rows.map((row) => ({
      id: row.id,
      category: row.category,
      status: row.status,
      submittedOn: row.submitted_on,
      excerpt:
        row.body.length > EXCERPT_LENGTH ? `${row.body.slice(0, EXCERPT_LENGTH).trimEnd()}…` : row.body,
      attachmentCount: row.attachments[0]?.count ?? 0,
      noteCount: row.notes[0]?.count ?? 0,
    })),
  };
}

export async function feedbackSummary(): Promise<{ newCount: number }> {
  return { newCount: await repository.countNewReports() };
}

async function loadReport(id: number): Promise<repository.FeedbackReportRecord> {
  const report = await repository.findReport(id);
  if (!report) throw new ApiError(404, 'El caso no existe', 'FEEDBACK_NOT_FOUND');
  return report;
}

async function buildCaseView(report: repository.FeedbackReportRecord): Promise<FeedbackCaseView> {
  const [attachments, notes] = await Promise.all([
    repository.findAttachments(report.id),
    repository.findNotes(report.id),
  ]);

  return {
    id: report.id,
    category: report.category,
    status: report.status,
    submittedOn: report.submitted_on,
    body: report.body,
    resolution: report.resolution,
    statusChangedAt: report.status_changed_at ? toIso(report.status_changed_at) : null,
    attachments: attachments.map((attachment) => ({
      id: attachment.id,
      position: attachment.position,
      mimeType: attachment.mime_type,
      sizeBytes: attachment.size_bytes,
      fileName: attachmentName(attachment.position, attachment.mime_type),
    })),
    notes: notes.map((note) => ({
      id: note.id,
      kind: note.kind,
      body: note.body,
      createdAt: toIso(note.created_at),
      author: note.author ? { id: note.author_id, name: note.author.full_name } : null,
    })),
  };
}

export async function getFeedbackCase(id: number, actorId: number): Promise<FeedbackCaseView> {
  const report = await loadReport(id);
  await repository.logAccess(report.id, 'FEEDBACK_VIEWED');

  if (report.status === 'NEW') {
    const updated = await repository.updateStatus(report.id, {
      status: 'IN_REVIEW',
      resolution: report.resolution,
      changedBy: actorId,
    });
    if (updated) return buildCaseView(updated);
  }

  return buildCaseView(report);
}

export async function updateFeedbackStatus(
  id: number,
  input: UpdateFeedbackStatusInput,
  actorId: number,
): Promise<FeedbackCaseView> {
  const current = await loadReport(id);

  if (current.status === 'RESOLVED') {
    throw new ApiError(409, 'El caso ya fue atendido y no se puede reabrir', 'FEEDBACK_CLOSED');
  }

  const resolution = input.status === 'RESOLVED' ? (input.resolution ?? null) : current.resolution;

  if (current.status === input.status && resolution === current.resolution) {
    return buildCaseView(current);
  }

  const updated = await repository.updateStatus(id, {
    status: input.status,
    resolution,
    changedBy: actorId,
  });
  if (!updated) throw new ApiError(404, 'El caso no existe', 'FEEDBACK_NOT_FOUND');

  return buildCaseView(updated);
}

export async function addFeedbackNote(
  id: number,
  input: AddFeedbackNoteInput,
  actorId: number,
): Promise<FeedbackCaseView> {
  const report = await loadReport(id);
  await repository.insertNote({ reportId: report.id, authorId: actorId, kind: input.kind, body: input.body });

  if (input.kind === 'REPLY' && report.status === 'NEW') {
    const updated = await repository.updateStatus(report.id, {
      status: 'IN_REVIEW',
      resolution: report.resolution,
      changedBy: actorId,
    });
    if (updated) return buildCaseView(updated);
  }

  return buildCaseView(report);
}

export async function feedbackEvidenceLink(
  id: number,
  attachmentId: number,
): Promise<{ url: string; fileName: string; mimeType: string }> {
  const attachment = await repository.findAttachment(id, attachmentId);
  if (!attachment) throw new ApiError(404, 'La evidencia no existe', 'EVIDENCE_NOT_FOUND');

  await repository.logAccess(id, 'FEEDBACK_EVIDENCE_DOWNLOADED', attachment.id);

  return {
    url: await signEvidence(attachment.storage_path),
    fileName: attachmentName(attachment.position, attachment.mime_type),
    mimeType: attachment.mime_type,
  };
}

export async function feedbackReport(query: FeedbackReportQuery): Promise<FeedbackReportView> {
  const rows = await repository.findReportStats(query);
  const byStatus = emptyStatusCounts();
  const byCategory = new Map(
    FEEDBACK_CATEGORIES.map((category) => [category, { total: 0, byStatus: emptyStatusCounts() }]),
  );
  const byMonth = new Map<string, number>();

  for (const row of rows) {
    byStatus[row.status] += 1;
    const bucket = byCategory.get(row.category);
    if (bucket) {
      bucket.total += 1;
      bucket.byStatus[row.status] += 1;
    }
    const month = row.submitted_on.slice(0, 7);
    byMonth.set(month, (byMonth.get(month) ?? 0) + 1);
  }

  return {
    total: rows.length,
    byStatus,
    byCategory: [...byCategory.entries()].map(([category, bucket]) => ({ category, ...bucket })),
    byMonth: [...byMonth.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([month, total]) => ({ month, total })),
  };
}
