import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

export const EXPORT_FORMATS = ['xlsx', 'pdf'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export type ActivityLogRow = {
  date: string;
  hours: number;
  activity: string;
  note: string | null;
  hourlyRate?: number;
  amount?: number;
};

export type ActivityLogCosts = {
  currency: string;
  amount: number;
  rates: { from: string; hourlyRate: number }[];
};

export type ActivityLogApproval = {
  seq: number;
  approver: string;
  approved: boolean;
  approvedOn: string | null;
  status: string;
  comments: string | null;
};

export type ActivityLog = {
  code: string;
  consultantName: string;
  assignmentCode: string | null;
  projectName: string;
  dailyHours: number;
  periodStart: string;
  periodEnd: string;
  rows: ActivityLogRow[];
  approvals: ActivityLogApproval[];
  costs?: ActivityLogCosts | null;
};

export type ExportedFile = {
  fileName: string;
  contentType: string;
  body: Buffer;
};

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const NAME_PARTICLES = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'da', 'di', 'do', 'van', 'von']);

const COLORS = {
  title: '17365D',
  period: '2F75B5',
  header: '5B9BD5',
  rule: 'D9E2F3',
  white: 'FFFFFF',
  ink: '1F2937',
};

type ColumnKey =
  | 'id'
  | 'collaborator'
  | 'period'
  | 'date'
  | 'day'
  | 'hours'
  | 'activity'
  | 'notes'
  | 'rate'
  | 'amount';

type Column = { key: ColumnKey; header: string; width: number; pdfWidth: number };

type Layout = {
  title: string;
  columns: Column[];
  lastColumn: string;
};

const COLUMNS: Record<ColumnKey, Column> = {
  id: { key: 'id', header: 'ID', width: 22, pdfWidth: 90 },
  collaborator: { key: 'collaborator', header: 'Collaborator', width: 28, pdfWidth: 110 },
  period: { key: 'period', header: 'Period', width: 25, pdfWidth: 112 },
  date: { key: 'date', header: 'Date', width: 13, pdfWidth: 56 },
  day: { key: 'day', header: 'Day', width: 14, pdfWidth: 58 },
  hours: { key: 'hours', header: 'Hours', width: 12, pdfWidth: 40 },
  activity: { key: 'activity', header: 'Activity', width: 88.29, pdfWidth: 0 },
  notes: { key: 'notes', header: 'Notes', width: 36.71, pdfWidth: 130 },
  rate: { key: 'rate', header: 'Hourly rate', width: 16, pdfWidth: 90 },
  amount: { key: 'amount', header: 'Amount', width: 16, pdfWidth: 90 },
};

const DETAIL_KEYS: ColumnKey[] = [
  'collaborator',
  'period',
  'date',
  'day',
  'hours',
  'activity',
  'notes',
];

const SUMMARY_KEYS: ColumnKey[] = [
  'collaborator',
  'period',
  'date',
  'hours',
  'rate',
  'amount',
  'activity',
  'notes',
];

const APPROVAL_HEADERS = ['Step', 'Approver', 'Status', 'Approved on', 'Comments'];

const APPROVAL_PDF_WIDTHS = [36, 200, 60, 66];

const SUMMARY_PDF_WIDTHS: Partial<Record<ColumnKey, number>> = {
  id: 70,
  collaborator: 85,
  period: 60,
  date: 54,
  hours: 34,
  rate: 62,
  amount: 72,
  notes: 80,
};

function columnLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

function layoutOf(log: ActivityLog): Layout {
  const keys = log.costs ? SUMMARY_KEYS : DETAIL_KEYS;
  const columns = [...(log.assignmentCode ? (['id'] as ColumnKey[]) : []), ...keys].map((key) => ({
    ...COLUMNS[key],
    pdfWidth: (log.costs ? SUMMARY_PDF_WIDTHS[key] : undefined) ?? COLUMNS[key].pdfWidth,
  }));

  return {
    title: log.costs ? 'HOURS SUMMARY' : 'ACTIVITY LOG',
    columns,
    lastColumn: columnLetter(columns.length - 1),
  };
}

function columnIndex(layout: Layout, key: ColumnKey): number {
  return layout.columns.findIndex((column) => column.key === key);
}

function formatAmount(value: number, currency: string): string {
  return `${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function ratesLabel(costs: ActivityLogCosts): string {
  if (costs.rates.length <= 1) {
    return formatAmount(costs.rates[0]?.hourlyRate ?? 0, costs.currency);
  }

  return costs.rates
    .map(
      (rate) =>
        `${formatAmount(rate.hourlyRate, costs.currency)} from ${displayDate(rate.from)}`,
    )
    .join(' · ');
}

function rowValues(log: ActivityLog, layout: Layout, entry: ActivityLogRow): string[] {
  const currency = log.costs?.currency ?? '';
  const values: Record<ColumnKey, string> = {
    id: log.assignmentCode ?? '',
    collaborator: log.consultantName,
    period: periodLabel(log),
    date: displayDate(entry.date),
    day: weekday(entry.date),
    hours: String(entry.hours),
    activity: entry.activity,
    notes: entry.note ?? '',
    rate: formatAmount(entry.hourlyRate ?? 0, currency),
    amount: formatAmount(entry.amount ?? 0, currency),
  };

  return layout.columns.map((column) => values[column.key]);
}

export function nameInitials(fullName: string): string {
  return fullName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/\s+/)
    .filter((word) => word && !NAME_PARTICLES.has(word.toLowerCase()))
    .map((word) => word[0]!.toUpperCase())
    .join('');
}

export function activityLogCode(assignmentStart: string, fullName: string): string {
  const [year, month, day] = assignmentStart.split('-');
  return `ID${day}_${month}_${year}_${nameInitials(fullName)}`;
}

function displayDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${month}/${day}/${year}`;
}

function utcDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!));
}

function weekday(iso: string): string {
  return WEEKDAYS[utcDate(iso).getUTCDay()]!;
}

function periodLabel(log: ActivityLog): string {
  return `${displayDate(log.periodStart)} - ${displayDate(log.periodEnd)}`;
}

function periodTitle(log: ActivityLog): string {
  return `PERIOD: ${displayDate(log.periodStart)} – ${displayDate(log.periodEnd)}`;
}

function workdayLabel(log: ActivityLog): string {
  return `${log.dailyHours * 5} hours per week | ${log.dailyHours} hours per day`;
}

function totalHours(log: ActivityLog): number {
  return Math.round(log.rows.reduce((total, row) => total + row.hours, 0) * 100) / 100;
}

function approvalsTitle(log: ActivityLog): string {
  const approved = log.approvals.filter((step) => step.approved).length;
  return `APPROVALS: ${approved} of ${log.approvals.length} required`;
}

function approvalValues(step: ActivityLogApproval): string[] {
  return [
    String(step.seq),
    step.approver,
    step.status,
    step.approvedOn ? displayDate(step.approvedOn) : '',
    step.comments ?? '',
  ];
}

function hoursLabel(log: ActivityLog): string {
  return log.costs ? 'Period hours' : 'Hours worked';
}

function hoursValue(log: ActivityLog): number {
  return totalHours(log);
}

async function renderXlsx(log: ActivityLog): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(log.code.slice(0, 31), {
    views: [{ showGridLines: false }],
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });

  const layout = layoutOf(log);
  sheet.columns = layout.columns.map((column) => ({ width: column.width }));

  const rule: Partial<ExcelJS.Borders> = {
    bottom: { style: 'thin', color: { argb: `FF${COLORS.rule}` } },
  };
  const wrapTop: Partial<ExcelJS.Alignment> = { vertical: 'top', wrapText: true };
  const fill = (color: string): ExcelJS.Fill => ({
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: `FF${color}` },
  });
  const whiteBold = { bold: true, color: { argb: `FF${COLORS.white}` }, name: 'Calibri' };

  const styleRow = (row: ExcelJS.Row) => {
    for (let column = 1; column <= layout.columns.length; column += 1) {
      const cell = row.getCell(column);
      cell.border = rule;
      cell.alignment = wrapTop;
    }
  };

  sheet.mergeCells(`A1:${layout.lastColumn}1`);
  const title = sheet.getCell('A1');
  title.value = `${layout.title} — ${log.code}`;
  title.font = { ...whiteBold, size: 16 };
  title.fill = fill(COLORS.title);
  title.alignment = { horizontal: 'center', vertical: 'top', wrapText: true };
  sheet.getRow(1).height = 21;

  const project = sheet.getRow(2);
  styleRow(project);
  project.getCell(1).value = 'Project';
  project.getCell(2).value = log.projectName;
  project.getCell(4).value = hoursLabel(log);
  project.getCell(5).value = hoursValue(log);
  project.getCell(1).font = { bold: true };
  project.getCell(4).font = { bold: true };

  const workday = sheet.getRow(3);
  styleRow(workday);
  workday.getCell(1).value = 'Schedule';
  workday.getCell(2).value = workdayLabel(log);
  workday.getCell(1).font = { bold: true };

  let nextRow = 4;

  if (log.costs) {
    const costs = sheet.getRow(nextRow);
    styleRow(costs);
    nextRow += 1;
    const amountFormat = `#,##0.00 "${log.costs.currency}"`;
    workday.getCell(4).value = 'Hourly rate';
    workday.getCell(4).font = { bold: true };
    if (log.costs.rates.length > 1) {
      sheet.mergeCells(`E3:${layout.lastColumn}3`);
      workday.getCell(5).value = ratesLabel(log.costs);
    } else {
      workday.getCell(5).value = log.costs.rates[0]?.hourlyRate ?? 0;
      workday.getCell(5).numFmt = amountFormat;
    }
    costs.getCell(4).value = 'Total amount';
    costs.getCell(4).font = { bold: true };
    costs.getCell(5).value = log.costs.amount;
    costs.getCell(5).numFmt = amountFormat;
  }

  if (log.approvals.length) {
    nextRow += 1;
    sheet.mergeCells(`A${nextRow}:${layout.lastColumn}${nextRow}`);
    const band = sheet.getCell(`A${nextRow}`);
    band.value = approvalsTitle(log);
    band.font = whiteBold;
    band.fill = fill(COLORS.period);
    band.alignment = wrapTop;
    band.border = rule;
    nextRow += 1;

    const spans: [number, number][] = [
      [1, 1],
      [2, 3],
      [4, 4],
      [5, 5],
      [6, layout.columns.length],
    ];
    const spanWidth = ([from, to]: [number, number]) =>
      layout.columns.slice(from - 1, to).reduce((total, column) => total + column.width, 0);
    const lineCount = (text: string, width: number) =>
      text
        .split('\n')
        .reduce((lines, line) => lines + Math.max(Math.ceil(line.length / width), 1), 0);

    const approvalRow = (values: string[], header: boolean) => {
      const row = sheet.getRow(nextRow);
      styleRow(row);
      spans.forEach(([from, to], index) => {
        const cell = row.getCell(from);
        cell.value = values[index] ?? '';
        if (header) {
          cell.font = whiteBold;
          cell.fill = fill(COLORS.header);
        }
        if (to > from) {
          sheet.mergeCells(`${columnLetter(from - 1)}${nextRow}:${columnLetter(to - 1)}${nextRow}`);
        }
      });
      row.height =
        15 *
        Math.max(...values.map((value, index) => lineCount(value, spanWidth(spans[index]!))));
      nextRow += 1;
    };

    approvalRow(APPROVAL_HEADERS, true);
    log.approvals.forEach((step) => approvalRow(approvalValues(step), false));
  }

  styleRow(sheet.getRow(nextRow));
  nextRow += 1;

  const periodRow = nextRow;
  const headerRow = periodRow + 1;
  sheet.pageSetup.printTitlesRow = `${periodRow}:${headerRow}`;

  sheet.mergeCells(`A${periodRow}:${layout.lastColumn}${periodRow}`);
  const period = sheet.getCell(`A${periodRow}`);
  period.value = periodTitle(log);
  period.font = whiteBold;
  period.fill = fill(COLORS.period);
  period.alignment = wrapTop;
  period.border = rule;

  const header = sheet.getRow(headerRow);
  layout.columns.forEach((column, index) => {
    const cell = header.getCell(index + 1);
    cell.value = column.header;
    cell.font = whiteBold;
    cell.fill = fill(COLORS.header);
    cell.alignment = wrapTop;
    cell.border = rule;
  });

  const firstDataRow = headerRow + 1;
  const amountFormat = `#,##0.00 "${log.costs?.currency ?? ''}"`;
  log.rows.forEach((entry, index) => {
    const row = sheet.getRow(firstDataRow + index);
    styleRow(row);
    layout.columns.forEach((column, columnIndex) => {
      const cell = row.getCell(columnIndex + 1);
      switch (column.key) {
        case 'id':
          cell.value = log.assignmentCode;
          break;
        case 'collaborator':
          cell.value = log.consultantName;
          break;
        case 'period':
          cell.value = periodLabel(log);
          break;
        case 'date':
          cell.value = utcDate(entry.date);
          cell.numFmt = 'mm/dd/yyyy';
          break;
        case 'day':
          cell.value = weekday(entry.date);
          break;
        case 'hours':
          cell.value = entry.hours;
          break;
        case 'activity':
          cell.value = entry.activity;
          break;
        case 'notes':
          cell.value = entry.note ?? null;
          break;
        case 'rate':
          cell.value = entry.hourlyRate ?? 0;
          cell.numFmt = amountFormat;
          break;
        case 'amount':
          cell.value = entry.amount ?? 0;
          cell.numFmt = amountFormat;
          break;
      }
    });
  });

  const lastDataRow = firstDataRow + Math.max(log.rows.length, 1) - 1;
  const totalRow = sheet.getRow(lastDataRow + 1);
  styleRow(totalRow);
  const hoursIndex = columnIndex(layout, 'hours');
  const hoursColumn = columnLetter(hoursIndex);
  totalRow.getCell(hoursIndex).value = 'TOTAL';
  totalRow.getCell(hoursIndex).font = { bold: true };
  totalRow.getCell(hoursIndex + 1).value = {
    formula: `SUM(${hoursColumn}${firstDataRow}:${hoursColumn}${lastDataRow})`,
    result: totalHours(log),
  };
  totalRow.getCell(hoursIndex + 1).font = { bold: true };

  if (log.costs) {
    const amountIndex = columnIndex(layout, 'amount');
    const amountColumn = columnLetter(amountIndex);
    const cell = totalRow.getCell(amountIndex + 1);
    cell.value = {
      formula: `SUM(${amountColumn}${firstDataRow}:${amountColumn}${lastDataRow})`,
      result: log.costs.amount,
    };
    cell.numFmt = amountFormat;
    cell.font = { bold: true };
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function renderPdf(log: ActivityLog): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', layout: 'landscape', margin: 36 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const bottom = doc.page.height - doc.page.margins.bottom;
    const layout = layoutOf(log);
    const fixed = layout.columns.reduce((sum, column) => sum + column.pdfWidth, 0);
    const columns = layout.columns.map((column) => column.pdfWidth || width - fixed);
    const padding = 4;
    const fontSize = 8;

    const band = (text: string, color: string, size: number, align: 'left' | 'center') => {
      doc.font('Helvetica-Bold').fontSize(size);
      const height = doc.heightOfString(text, { width: width - padding * 2 }) + padding * 2;
      const y = doc.y;
      doc.rect(left, y, width, height).fill(`#${color}`);
      doc
        .fillColor(`#${COLORS.white}`)
        .text(text, left + padding, y + padding, { width: width - padding * 2, align });
      doc.y = y + height;
      doc.x = left;
    };

    const rule = (y: number) => {
      doc
        .moveTo(left, y)
        .lineTo(left + width, y)
        .lineWidth(0.5)
        .strokeColor(`#${COLORS.rule}`)
        .stroke();
    };

    const cells = (
      values: string[],
      options: { bold?: boolean; fillColor?: string; widths?: number[] },
    ) => {
      const widths = options.widths ?? columns;
      doc.font(options.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize);
      const height =
        Math.max(
          ...values.map((value, index) =>
            doc.heightOfString(value || ' ', { width: widths[index]! - padding * 2 }),
          ),
        ) +
        padding * 2;

      return {
        height,
        draw: (y: number) => {
          if (options.fillColor) {
            doc.rect(left, y, width, height).fill(`#${options.fillColor}`);
          }
          let x = left;
          values.forEach((value, index) => {
            doc
              .fillColor(options.fillColor ? `#${COLORS.white}` : `#${COLORS.ink}`)
              .text(value, x + padding, y + padding, { width: widths[index]! - padding * 2 });
            x += widths[index]!;
          });
          rule(y + height);
        },
      };
    };

    const place = (row: { height: number; draw: (y: number) => void }) => {
      const y = doc.y;
      row.draw(y);
      doc.y = y + row.height;
      doc.x = left;
    };

    const header = () =>
      place(
        cells(
          layout.columns.map((column) => column.header),
          { bold: true, fillColor: COLORS.header },
        ),
      );

    band(`${layout.title} — ${log.code}`, COLORS.title, 14, 'center');
    doc.moveDown(0.6);

    doc.fillColor(`#${COLORS.ink}`).fontSize(9);
    const info: [string, string][] = [
      ['Project', log.projectName],
      [hoursLabel(log), String(hoursValue(log))],
      ['Schedule', workdayLabel(log)],
      ...(log.costs
        ? ([
            ['Hourly rate', ratesLabel(log.costs)],
            ['Total amount', formatAmount(log.costs.amount, log.costs.currency)],
          ] as [string, string][])
        : []),
    ];
    for (const [label, value] of info) {
      const y = doc.y;
      doc.font('Helvetica-Bold').text(label, left, y, { width: 120 });
      doc.font('Helvetica').text(value, left + 130, y, { width: width - 130 });
      doc.y = Math.max(doc.y, y + 12) + 2;
      rule(doc.y);
      doc.y += 4;
    }

    if (log.approvals.length) {
      const fixedApproval = APPROVAL_PDF_WIDTHS.reduce((sum, value) => sum + value, 0);
      const widths = [...APPROVAL_PDF_WIDTHS, width - fixedApproval];

      doc.moveDown(0.4);
      band(approvalsTitle(log), COLORS.period, 10, 'left');
      doc.moveDown(0.2);
      place(cells(APPROVAL_HEADERS, { bold: true, fillColor: COLORS.header, widths }));

      for (const step of log.approvals) {
        const row = cells(approvalValues(step), { widths });
        if (doc.y + row.height > bottom) doc.addPage();
        place(row);
      }
    }

    doc.moveDown(0.4);
    band(periodTitle(log), COLORS.period, 10, 'left');
    doc.moveDown(0.2);
    header();

    for (const entry of log.rows) {
      const row = cells(rowValues(log, layout, entry), {});

      if (doc.y + row.height > bottom) {
        doc.addPage();
        header();
      }

      place(row);
    }

    const hoursIndex = columnIndex(layout, 'hours');
    const total = cells(
      layout.columns.map((column, index) =>
        index === hoursIndex - 1
          ? 'TOTAL'
          : column.key === 'hours'
            ? String(totalHours(log))
            : column.key === 'amount' && log.costs
              ? formatAmount(log.costs.amount, log.costs.currency)
              : '',
      ),
      { bold: true },
    );
    if (doc.y + total.height > bottom) doc.addPage();
    place(total);

    doc.end();
  });
}

export async function renderActivityLog(
  log: ActivityLog,
  format: ExportFormat,
): Promise<ExportedFile> {
  if (format === 'pdf') {
    return {
      fileName: `${log.code}.pdf`,
      contentType: 'application/pdf',
      body: await renderPdf(log),
    };
  }

  return {
    fileName: `${log.code}.xlsx`,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    body: await renderXlsx(log),
  };
}
