import ExcelJS from 'exceljs';
import type { ExportedFile } from '../timesheets/timesheets.export.js';
import { AUDIT_LABELS, type AuditLabels } from './audit.labels.js';
import type { AuditColumn, ExportAuditQuery } from './audit.schema.js';
import type { AuditEntryView } from './audit.service.js';
import { AUDIT_TIME_ZONE, zonedWallClock } from './audit.time.js';

const COLORS = {
  title: '17365D',
  section: '2F75B5',
  header: '5B9BD5',
  rule: 'D9E2F3',
  white: 'FFFFFF',
};

const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const COLUMN_WIDTHS: Record<AuditColumn, number> = {
  occurredAt: 20,
  category: 20,
  action: 30,
  timesheet: 22,
  week: 24,
  project: 26,
  subject: 26,
  entity: 34,
  actor: 26,
  actorEmail: 30,
  actorRole: 18,
  source: 18,
  fromStatus: 16,
  toStatus: 16,
  comments: 40,
  changes: 60,
  details: 44,
  ipAddress: 18,
  userAgent: 40,
  requestId: 38,
};

const DETAIL_KEYS = [
  'title',
  'recipientEmail',
  'fileName',
  'onBehalfOf',
  'seq',
  'attempts',
  'error',
] as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type CellValue = string | number | Date | null;

export type AuditWorkbookInput = {
  entries: AuditEntryView[];
  query: ExportAuditQuery;
  truncated: boolean;
  limit: number;
  generatedBy: string;
  filterNames: { actor?: string; subject?: string; project?: string };
};

function displayDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

function wallClock(iso: string): Date {
  return zonedWallClock(new Date(iso), AUDIT_TIME_ZONE);
}

function stamp(date: Date): string {
  return date.toISOString().slice(0, 16).replace('T', ' ');
}

function isFlowStep(value: unknown): value is { seq: number; type: string; name: string | null } {
  return typeof value === 'object' && value !== null && 'seq' in value && 'type' in value;
}

function formatValue(field: string, value: unknown, labels: AuditLabels): string {
  if (value === null || value === undefined || value === '') return labels.empty;
  if (typeof value === 'boolean') return value ? labels.yes : labels.no;

  if (Array.isArray(value)) {
    if (!value.length) return labels.empty;
    return value
      .map((item) => {
        if (!isFlowStep(item)) return String(item);
        const name =
          item.type === 'ROLE' ? (labels.roles[item.name ?? ''] ?? item.name) : item.name;
        return `${item.seq}. ${name ?? labels.empty} (${labels.approverTypes[item.type] ?? item.type})`;
      })
      .join('; ');
  }

  const text = String(value);
  if (field === 'role_id') return labels.roles[text] ?? text;
  if (field === 'permission') return labels.permissions[text] ?? text;
  if (field === 'status') return labels.statuses[text] ?? text;
  if (field === 'rate_period') return labels.ratePeriods[text] ?? text;
  if (field === 'contract_type') return labels.contractTypes[text] ?? text;
  if (ISO_DATE.test(text)) return displayDate(text);

  return text;
}

function fieldLabel(field: string, labels: AuditLabels): string {
  return labels.fields[field] ?? field.replace(/_/g, ' ');
}

function changesSummary(entry: AuditEntryView, labels: AuditLabels): string {
  return Object.entries(entry.changes)
    .map(([field, change]) => {
      const label = fieldLabel(field, labels);
      if (entry.action === 'CREATED' || change.from === null) {
        return `${label}: ${formatValue(field, change.to, labels)}`;
      }
      if (entry.action === 'DELETED' || change.to === null) {
        return `${label}: ${formatValue(field, change.from, labels)} → ${labels.empty}`;
      }
      return `${label}: ${formatValue(field, change.from, labels)} → ${formatValue(field, change.to, labels)}`;
    })
    .join('\n');
}

function detailsSummary(entry: AuditEntryView, labels: AuditLabels): string {
  return DETAIL_KEYS.filter((key) => entry.metadata[key] !== undefined && entry.metadata[key] !== null)
    .map((key) => `${fieldLabel(key, labels)}: ${String(entry.metadata[key])}`)
    .join('\n');
}

function weekLabel(entry: AuditEntryView): string | null {
  const start = entry.metadata.weekStart;
  const end = entry.metadata.weekEnd;
  if (typeof start !== 'string' || typeof end !== 'string') return null;
  return `${displayDate(start)} – ${displayDate(end)}`;
}

function cellFor(column: AuditColumn, entry: AuditEntryView, labels: AuditLabels): CellValue {
  switch (column) {
    case 'occurredAt':
      return wallClock(entry.occurredAt);
    case 'category':
      return labels.categories[entry.category as keyof AuditLabels['categories']] ?? entry.category;
    case 'action':
      return labels.actions[entry.action as keyof AuditLabels['actions']] ?? entry.action;
    case 'timesheet':
      return entry.timesheet ? (entry.timesheet.code ?? `#${entry.timesheet.id}`) : null;
    case 'week':
      return weekLabel(entry);
    case 'project':
      return entry.project?.name ?? null;
    case 'subject':
      return entry.subject?.name ?? null;
    case 'entity': {
      const type = labels.entities[entry.entityType] ?? entry.entityType;
      return entry.entityLabel ? `${type}: ${entry.entityLabel}` : type;
    }
    case 'actor':
      return entry.actor?.name || (entry.source === 'EXTERNAL' ? labels.sources.EXTERNAL : labels.system);
    case 'actorEmail':
      return entry.actor?.email ?? null;
    case 'actorRole':
      return entry.actor?.roleCode ? (labels.roles[entry.actor.roleCode] ?? entry.actor.roleCode) : null;
    case 'source':
      return labels.sources[entry.source as keyof AuditLabels['sources']] ?? entry.source;
    case 'fromStatus':
      return entry.fromStatus ? (labels.statuses[entry.fromStatus] ?? entry.fromStatus) : null;
    case 'toStatus':
      return entry.toStatus ? (labels.statuses[entry.toStatus] ?? entry.toStatus) : null;
    case 'comments':
      return entry.comments;
    case 'changes':
      return changesSummary(entry, labels) || null;
    case 'details':
      return detailsSummary(entry, labels) || null;
    case 'ipAddress':
      return entry.ipAddress;
    case 'userAgent':
      return entry.userAgent;
    case 'requestId':
      return entry.requestId;
  }
}

function filtersSummary(input: AuditWorkbookInput, labels: AuditLabels): string {
  const { query, filterNames } = input;
  const names = labels.filterNames;
  const parts: string[] = [];

  if (query.categories.length) {
    parts.push(`${names.categories}: ${query.categories.map((code) => labels.categories[code]).join(', ')}`);
  }
  if (query.actions.length) {
    parts.push(`${names.actions}: ${query.actions.map((code) => labels.actions[code]).join(', ')}`);
  }
  if (query.sources.length) {
    parts.push(`${names.sources}: ${query.sources.map((code) => labels.sources[code]).join(', ')}`);
  }
  if (query.actorId) parts.push(`${names.actor}: ${filterNames.actor ?? `#${query.actorId}`}`);
  if (query.subjectUserId) {
    parts.push(`${names.subject}: ${filterNames.subject ?? `#${query.subjectUserId}`}`);
  }
  if (query.projectId) parts.push(`${names.project}: ${filterNames.project ?? `#${query.projectId}`}`);
  if (query.timesheet) parts.push(`${names.timesheet}: ${query.timesheet}`);
  if (query.search) parts.push(`${names.search}: ${query.search}`);

  return parts.join(' · ') || labels.info.allRecords;
}

function rangeSummary(query: ExportAuditQuery, labels: AuditLabels): string {
  if (query.from && query.to) return `${displayDate(query.from)} – ${displayDate(query.to)}`;
  if (query.from) return `${displayDate(query.from)} –`;
  if (query.to) return `– ${displayDate(query.to)}`;
  return labels.info.allRecords;
}

function fill(color: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${color}` } };
}

const RULE: Partial<ExcelJS.Borders> = {
  bottom: { style: 'thin', color: { argb: `FF${COLORS.rule}` } },
};

const WHITE_BOLD = { bold: true, color: { argb: `FF${COLORS.white}` }, name: 'Calibri' };

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

function writeTable(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  headers: { label: string; width: number }[],
  rows: CellValue[][],
): void {
  const last = columnLetter(headers.length - 1);

  const header = sheet.getRow(startRow);
  headers.forEach((column, index) => {
    const cell = header.getCell(index + 1);
    cell.value = column.label;
    cell.font = WHITE_BOLD;
    cell.fill = fill(COLORS.header);
    cell.alignment = { vertical: 'middle', wrapText: true };
  });

  rows.forEach((values, rowIndex) => {
    const row = sheet.getRow(startRow + 1 + rowIndex);
    values.forEach((value, index) => {
      const cell = row.getCell(index + 1);
      if (value !== null) cell.value = value;
      if (value instanceof Date) cell.numFmt = 'dd/mm/yyyy hh:mm:ss';
      cell.border = RULE;
      cell.alignment = { vertical: 'top', wrapText: typeof value === 'string' };
    });
  });

  const lastRow = Math.max(startRow + rows.length, startRow + 1);
  sheet.autoFilter = `A${startRow}:${last}${lastRow}`;
  sheet.views = [{ state: 'frozen', ySplit: startRow, showGridLines: false }];
}

function writeTitle(sheet: ExcelJS.Worksheet, title: string, widths: number[]): void {
  sheet.columns = widths.map((width) => ({ width }));
  const width = widths.length;
  sheet.mergeCells(`A1:${columnLetter(Math.max(width, 2) - 1)}1`);
  const cell = sheet.getCell('A1');
  cell.value = title;
  cell.font = { ...WHITE_BOLD, size: 14 };
  cell.fill = fill(COLORS.title);
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 22;
}

export async function renderAuditWorkbook(input: AuditWorkbookInput): Promise<ExportedFile> {
  const labels = AUDIT_LABELS[input.query.locale];
  const columns = input.query.columns;
  const workbook = new ExcelJS.Workbook();
  const generatedAt = wallClock(new Date().toISOString());

  const sheet = workbook.addWorksheet(labels.sheet, {
    views: [{ showGridLines: false }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  writeTitle(
    sheet,
    labels.title,
    columns.map((column) => COLUMN_WIDTHS[column]),
  );

  const info: [string, string][] = [
    [labels.info.generatedAt, stamp(generatedAt)],
    [labels.info.generatedBy, input.generatedBy],
    [labels.info.range, rangeSummary(input.query, labels)],
    [labels.info.filters, filtersSummary(input, labels)],
    [labels.info.rows, String(input.entries.length)],
    [labels.info.timeZone, AUDIT_TIME_ZONE],
  ];
  if (input.truncated) info.push(['', labels.info.truncated(input.limit)]);

  info.forEach(([label, value], index) => {
    const rowNumber = index + 2;
    const row = sheet.getRow(rowNumber);
    row.getCell(1).value = label;
    row.getCell(1).font = { bold: true };
    if (columns.length > 2) sheet.mergeCells(`B${rowNumber}:${columnLetter(columns.length - 1)}${rowNumber}`);
    row.getCell(2).value = value;
    row.getCell(2).alignment = { wrapText: true };
  });

  writeTable(
    sheet,
    info.length + 3,
    columns.map((column) => ({ label: labels.columns[column], width: COLUMN_WIDTHS[column] })),
    input.entries.map((entry) => columns.map((column) => cellFor(column, entry, labels))),
  );

  if (input.query.changeDetail) {
    const detail = workbook.addWorksheet(labels.detailSheet, { views: [{ showGridLines: false }] });
    const headers = [
      { label: labels.columns.occurredAt, width: COLUMN_WIDTHS.occurredAt },
      { label: labels.columns.action, width: COLUMN_WIDTHS.action },
      { label: labels.columns.entity, width: COLUMN_WIDTHS.entity },
      { label: labels.columns.timesheet, width: COLUMN_WIDTHS.timesheet },
      { label: labels.columns.actor, width: COLUMN_WIDTHS.actor },
      { label: labels.detailColumns.field, width: 28 },
      { label: labels.detailColumns.before, width: 36 },
      { label: labels.detailColumns.after, width: 36 },
    ];
    const rows: CellValue[][] = [];

    for (const entry of input.entries) {
      for (const [field, change] of Object.entries(entry.changes)) {
        rows.push([
          wallClock(entry.occurredAt),
          cellFor('action', entry, labels),
          cellFor('entity', entry, labels),
          cellFor('timesheet', entry, labels),
          cellFor('actor', entry, labels),
          fieldLabel(field, labels),
          formatValue(field, change.from, labels),
          formatValue(field, change.to, labels),
        ]);
      }
    }

    writeTitle(
      detail,
      labels.detailTitle,
      headers.map((header) => header.width),
    );
    writeTable(detail, 3, headers, rows);
  }

  const day = generatedAt.toISOString().slice(0, 10);

  return {
    fileName: `${input.query.locale === 'en' ? 'audit-log' : 'bitacora-auditoria'}-${day}.xlsx`,
    contentType: XLSX_CONTENT_TYPE,
    body: Buffer.from(await workbook.xlsx.writeBuffer()),
  };
}
