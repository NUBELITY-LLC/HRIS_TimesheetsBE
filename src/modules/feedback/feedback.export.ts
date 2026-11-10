import ExcelJS from 'exceljs';
import type { ExportedFile } from '../timesheets/timesheets.export.js';
import {
  FEEDBACK_STATUSES,
  type FeedbackCategory,
  type ExportFeedbackCasesQuery,
  type FeedbackReportExportQuery,
  type FeedbackStatus,
} from './feedback.schema.js';
import type { FeedbackListRecord } from './feedback.repository.js';
import type { FeedbackReportView } from './feedback.service.js';

const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

type Locale = 'es' | 'en';

const LABELS: Record<
  Locale,
  {
    title: string;
    summary: string;
    byCategory: string;
    byMonth: string;
    period: string;
    allPeriod: string;
    generatedAt: string;
    category: string;
    month: string;
    total: string;
    received: string;
    filters: string;
    statusFilter: string;
    casesTitle: string;
    casesSheet: string;
    columns: {
      case: string;
      submittedOn: string;
      category: string;
      status: string;
      description: string;
      resolution: string;
      statusChangedAt: string;
      attachments: string;
      notes: string;
    };
    categories: Record<FeedbackCategory, string>;
    statuses: Record<FeedbackStatus, string>;
  }
> = {
  es: {
    title: 'Reporte del buzón anónimo',
    summary: 'Resumen',
    byCategory: 'Por categoría',
    byMonth: 'Por mes',
    period: 'Periodo',
    allPeriod: 'Todos los casos',
    generatedAt: 'Generado',
    category: 'Categoría',
    month: 'Mes',
    total: 'Total',
    received: 'Casos recibidos',
    filters: 'Filtros',
    statusFilter: 'Estado',
    casesTitle: 'Casos del buzón anónimo',
    casesSheet: 'Casos',
    columns: {
      case: 'Caso',
      submittedOn: 'Fecha de recepción',
      category: 'Categoría',
      status: 'Estado',
      description: 'Descripción',
      resolution: 'Acciones tomadas',
      statusChangedAt: 'Último cambio de estado',
      attachments: 'Evidencias',
      notes: 'Notas y respuestas',
    },
    categories: {
      WORK_ENVIRONMENT: 'Ambiente laboral',
      HARASSMENT: 'Violencia, acoso u hostigamiento',
      WORKLOAD: 'Carga de trabajo y jornada',
      PROJECT_CLIENT: 'Proyecto o cliente',
      TOOLS: 'Herramientas',
      SUGGESTION: 'Sugerencia',
      OTHER: 'Otro',
    },
    statuses: { NEW: 'Nuevo', IN_REVIEW: 'En revisión', RESOLVED: 'Atendido', ARCHIVED: 'Archivado' },
  },
  en: {
    title: 'Anonymous inbox report',
    summary: 'Summary',
    byCategory: 'By category',
    byMonth: 'By month',
    period: 'Period',
    allPeriod: 'All cases',
    generatedAt: 'Generated',
    category: 'Category',
    month: 'Month',
    total: 'Total',
    received: 'Cases received',
    filters: 'Filters',
    statusFilter: 'Status',
    casesTitle: 'Anonymous inbox cases',
    casesSheet: 'Cases',
    columns: {
      case: 'Case',
      submittedOn: 'Received on',
      category: 'Category',
      status: 'Status',
      description: 'Description',
      resolution: 'Actions taken',
      statusChangedAt: 'Last status change',
      attachments: 'Evidence',
      notes: 'Notes and replies',
    },
    categories: {
      WORK_ENVIRONMENT: 'Work environment',
      HARASSMENT: 'Violence, harassment or bullying',
      WORKLOAD: 'Workload and working hours',
      PROJECT_CLIENT: 'Project or client',
      TOOLS: 'Tools',
      SUGGESTION: 'Suggestion',
      OTHER: 'Other',
    },
    statuses: { NEW: 'New', IN_REVIEW: 'In review', RESOLVED: 'Resolved', ARCHIVED: 'Archived' },
  },
};

const COLORS = {
  title: '17365D',
  band: '2F75B5',
  header: '5B9BD5',
  rule: 'D9E2F3',
  white: 'FFFFFF',
};

const RULE: Partial<ExcelJS.Borders> = {
  bottom: { style: 'thin', color: { argb: `FF${COLORS.rule}` } },
};
const WRAP_TOP: Partial<ExcelJS.Alignment> = { vertical: 'top', wrapText: true };
const WHITE_BOLD: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: `FF${COLORS.white}` },
  name: 'Calibri',
};

function fill(color: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${color}` } };
}

function columnLetter(index: number): string {
  let value = index + 1;
  let letters = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    value = Math.floor((value - 1) / 26);
  }
  return letters;
}

type SheetWriter = {
  sheet: ExcelJS.Worksheet;
  title: (text: string) => void;
  info: (label: string, value: string | number) => void;
  blank: () => void;
  band: (text: string) => void;
  header: (values: string[]) => number;
  row: (values: (string | number)[], options?: { bold?: boolean }) => void;
};

function sheetWriter(workbook: ExcelJS.Workbook, name: string, widths: number[]): SheetWriter {
  const sheet = workbook.addWorksheet(name.slice(0, 31), {
    views: [{ showGridLines: false }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  sheet.columns = widths.map((width) => ({ width }));
  const last = columnLetter(widths.length - 1);
  let next = 1;

  const ruled = (row: ExcelJS.Row) => {
    for (let column = 1; column <= widths.length; column += 1) {
      const cell = row.getCell(column);
      cell.border = RULE;
      cell.alignment = WRAP_TOP;
    }
  };

  return {
    sheet,
    title(text) {
      sheet.mergeCells(`A${next}:${last}${next}`);
      const cell = sheet.getCell(`A${next}`);
      cell.value = text;
      cell.font = { ...WHITE_BOLD, size: 16 };
      cell.fill = fill(COLORS.title);
      cell.alignment = { horizontal: 'center', vertical: 'top', wrapText: true };
      sheet.getRow(next).height = 21;
      next += 1;
    },
    info(label, value) {
      const row = sheet.getRow(next);
      ruled(row);
      row.getCell(1).value = label;
      row.getCell(1).font = { bold: true };
      if (widths.length > 2) sheet.mergeCells(`B${next}:${last}${next}`);
      row.getCell(2).value = value;
      next += 1;
    },
    blank() {
      ruled(sheet.getRow(next));
      next += 1;
    },
    band(text) {
      sheet.mergeCells(`A${next}:${last}${next}`);
      const cell = sheet.getCell(`A${next}`);
      cell.value = text;
      cell.font = WHITE_BOLD;
      cell.fill = fill(COLORS.band);
      cell.alignment = WRAP_TOP;
      cell.border = RULE;
      next += 1;
    },
    header(values) {
      const row = sheet.getRow(next);
      values.forEach((value, index) => {
        const cell = row.getCell(index + 1);
        cell.value = value;
        cell.font = WHITE_BOLD;
        cell.fill = fill(COLORS.header);
        cell.alignment = WRAP_TOP;
        cell.border = RULE;
      });
      const headerRow = next;
      next += 1;
      return headerRow;
    },
    row(values, options) {
      const row = sheet.getRow(next);
      ruled(row);
      values.forEach((value, index) => {
        const cell = row.getCell(index + 1);
        cell.value = value;
        if (options?.bold) cell.font = { bold: true };
      });
      next += 1;
    },
  };
}

function monthName(month: string, locale: Locale): string {
  const [year, value] = month.split('-').map(Number);
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-MX', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year!, value! - 1, 1)));
}

function periodOf(query: { from?: string; to?: string }, labels: (typeof LABELS)[Locale]): string {
  return query.from || query.to ? `${query.from ?? '…'} – ${query.to ?? '…'}` : labels.allPeriod;
}

function filtersOf(
  query: { categories: FeedbackCategory[]; statuses?: FeedbackStatus[] },
  labels: (typeof LABELS)[Locale],
): string | null {
  const parts: string[] = [];
  if (query.categories.length) {
    parts.push(`${labels.category}: ${query.categories.map((item) => labels.categories[item]).join(', ')}`);
  }
  if (query.statuses?.length) {
    parts.push(`${labels.statusFilter}: ${query.statuses.map((item) => labels.statuses[item]).join(', ')}`);
  }
  return parts.length ? parts.join(' · ') : null;
}

export function feedbackCategoryLabel(category: FeedbackCategory, locale: Locale): string {
  return LABELS[locale].categories[category];
}

export function feedbackCategoryFromLabel(label: string): FeedbackCategory | null {
  const entry = Object.entries(LABELS.es.categories).find(([, value]) => value === label);
  return entry ? (entry[0] as FeedbackCategory) : null;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function renderFeedbackReport(
  report: FeedbackReportView,
  query: FeedbackReportExportQuery,
): Promise<ExportedFile> {
  const labels = LABELS[query.locale];
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();

  const statusWidths = FEEDBACK_STATUSES.map(() => 14);
  const widths = [36, ...statusWidths, 12];
  const writer = sheetWriter(workbook, labels.summary, widths);
  writer.title(labels.title);
  writer.info(labels.period, periodOf(query, labels));
  writer.info(labels.generatedAt, today());
  const filters = filtersOf(query, labels);
  if (filters) writer.info(labels.filters, filters);
  writer.info(labels.received, report.total);
  writer.blank();

  writer.band(labels.summary);
  writer.header([labels.statusFilter, labels.total]);
  for (const status of FEEDBACK_STATUSES) {
    writer.row([labels.statuses[status], report.byStatus[status]]);
  }
  writer.row([labels.total.toUpperCase(), report.total], { bold: true });
  writer.blank();

  writer.band(labels.byCategory);
  writer.header([labels.category, ...FEEDBACK_STATUSES.map((status) => labels.statuses[status]), labels.total]);
  for (const row of report.byCategory) {
    writer.row([
      labels.categories[row.category],
      ...FEEDBACK_STATUSES.map((status) => row.byStatus[status]),
      row.total,
    ]);
  }
  writer.row(
    [
      labels.total.toUpperCase(),
      ...FEEDBACK_STATUSES.map((status) => report.byStatus[status]),
      report.total,
    ],
    { bold: true },
  );
  writer.blank();

  writer.band(labels.byMonth);
  writer.header([labels.month, labels.total]);
  for (const row of report.byMonth) {
    writer.row([monthName(row.month, query.locale), row.total]);
  }
  writer.row([labels.total.toUpperCase(), report.total], { bold: true });

  return {
    fileName:
      query.locale === 'en'
        ? `anonymous-inbox-report-${today()}.xlsx`
        : `reporte-buzon-anonimo-${today()}.xlsx`,
    contentType: XLSX_CONTENT_TYPE,
    body: Buffer.from(await workbook.xlsx.writeBuffer()),
    label: labels.title,
    records: report.total,
  };
}

export async function renderFeedbackCases(
  rows: FeedbackListRecord[],
  query: ExportFeedbackCasesQuery,
): Promise<ExportedFile> {
  const labels = LABELS[query.locale];
  const c = labels.columns;
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();

  const writer = sheetWriter(workbook, labels.casesSheet, [10, 16, 30, 13, 60, 45, 18, 11, 14]);
  writer.title(labels.casesTitle);
  writer.info(labels.period, periodOf(query, labels));
  writer.info(labels.generatedAt, today());
  const filters = filtersOf(query, labels);
  if (filters) writer.info(labels.filters, filters);
  writer.info(labels.received, rows.length);
  writer.blank();

  writer.band(labels.casesSheet);
  const headerRow = writer.header([
    c.case,
    c.submittedOn,
    c.category,
    c.status,
    c.description,
    c.resolution,
    c.statusChangedAt,
    c.attachments,
    c.notes,
  ]);
  writer.sheet.pageSetup.printTitlesRow = `${headerRow}:${headerRow}`;
  writer.sheet.views = [{ showGridLines: false, state: 'frozen', ySplit: headerRow }];

  for (const row of rows) {
    writer.row([
      `#${row.id}`,
      row.submitted_on,
      labels.categories[row.category],
      labels.statuses[row.status],
      row.body,
      row.status === 'RESOLVED' ? (row.resolution ?? '') : '',
      row.status_changed_at ? row.status_changed_at.slice(0, 10) : '',
      row.attachments[0]?.count ?? 0,
      row.notes[0]?.count ?? 0,
    ]);
  }

  return {
    fileName:
      query.locale === 'en'
        ? `anonymous-inbox-cases-${today()}.xlsx`
        : `casos-buzon-anonimo-${today()}.xlsx`,
    contentType: XLSX_CONTENT_TYPE,
    body: Buffer.from(await workbook.xlsx.writeBuffer()),
    label: labels.casesTitle,
    records: rows.length,
  };
}
