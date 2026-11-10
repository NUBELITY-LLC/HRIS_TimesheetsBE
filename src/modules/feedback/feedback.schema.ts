import { z } from 'zod';

export const FEEDBACK_CATEGORIES = [
  'WORK_ENVIRONMENT',
  'HARASSMENT',
  'WORKLOAD',
  'PROJECT_CLIENT',
  'TOOLS',
  'SUGGESTION',
  'OTHER',
] as const;

export const FEEDBACK_STATUSES = ['NEW', 'IN_REVIEW', 'RESOLVED', 'ARCHIVED'] as const;

export const FEEDBACK_NOTE_KINDS = ['INTERNAL', 'REPLY'] as const;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];
export type FeedbackNoteKind = (typeof FEEDBACK_NOTE_KINDS)[number];

const MAX_TEXT = 5000;

const longText = (label: string) =>
  z
    .string({ message: `${label} es obligatorio` })
    .trim()
    .min(1, `${label} es obligatorio`)
    .max(MAX_TEXT, `${label} excede los ${MAX_TEXT} caracteres`);

export const submitFeedbackSchema = z.object({
  category: z.enum(FEEDBACK_CATEGORIES, { message: 'Selecciona una categoria valida' }),
  body: longText('La descripcion'),
});

export type SubmitFeedbackInput = z.infer<typeof submitFeedbackSchema>;

export const trackFeedbackSchema = z.object({
  code: z
    .string({ message: 'El folio es obligatorio' })
    .trim()
    .min(1, 'El folio es obligatorio')
    .max(40, 'El folio no es valido'),
});

export type TrackFeedbackInput = z.infer<typeof trackFeedbackSchema>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener formato YYYY-MM-DD');

const csvEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) =>
      (Array.isArray(value) ? value : value ? value.split(',') : [])
        .map((item) => item.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.enum(values)));

const rangeFilters = {
  from: isoDate.optional(),
  to: isoDate.optional(),
  categories: csvEnum(FEEDBACK_CATEGORIES),
};

export const listFeedbackQuerySchema = z.object({
  ...rangeFilters,
  statuses: csvEnum(FEEDBACK_STATUSES),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListFeedbackQuery = z.infer<typeof listFeedbackQuerySchema>;

export const exportFeedbackCasesQuerySchema = z.object({
  ...rangeFilters,
  statuses: csvEnum(FEEDBACK_STATUSES),
  locale: z.enum(['es', 'en']).default('es'),
});

export type ExportFeedbackCasesQuery = z.infer<typeof exportFeedbackCasesQuerySchema>;

export const feedbackReportQuerySchema = z.object(rangeFilters);

export type FeedbackReportQuery = z.infer<typeof feedbackReportQuerySchema>;

export const feedbackReportExportQuerySchema = feedbackReportQuerySchema.extend({
  locale: z.enum(['es', 'en']).default('es'),
});

export type FeedbackReportExportQuery = z.infer<typeof feedbackReportExportQuerySchema>;

export const feedbackIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const feedbackAttachmentParamSchema = feedbackIdParamSchema.extend({
  attachmentId: z.coerce.number().int().positive(),
});

export const updateFeedbackStatusSchema = z
  .object({
    status: z.enum(FEEDBACK_STATUSES, { message: 'Selecciona un estado valido' }),
    resolution: z.string().trim().max(MAX_TEXT, `Las acciones exceden los ${MAX_TEXT} caracteres`).optional(),
  })
  .refine((value) => value.status !== 'RESOLVED' || Boolean(value.resolution), {
    path: ['resolution'],
    message: 'Describe las acciones tomadas',
  });

export type UpdateFeedbackStatusInput = z.infer<typeof updateFeedbackStatusSchema>;

export const addFeedbackNoteSchema = z.object({
  kind: z.enum(FEEDBACK_NOTE_KINDS, { message: 'Selecciona un tipo de nota valido' }),
  body: longText('La nota'),
});

export type AddFeedbackNoteInput = z.infer<typeof addFeedbackNoteSchema>;
