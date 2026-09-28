import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

export const EXPORT_FORMATS = ['xlsx', 'pdf'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export type ActivityLogRow = {
  date: string;
  hours: number;
  activity: string;
  note: string | null;
};

export type ActivityLogCosts = {
  currency: string;
  hourlyRate: number;
  amount: number;
};

export type ActivityLog = {
  code: string;
  projectName: string;
  monthlyHours: number;
  dailyHours: number;
  periodStart: string;
  periodEnd: string;
  rows: ActivityLogRow[];
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

type Layout = {
  title: string;
  headers: string[];
  widths: number[];
  pdfWidths: number[];
  lastColumn: string;
};

const DETAIL_LAYOUT: Layout = {
  title: 'ACTIVITY LOG',
  headers: ['Resource', 'Period', 'Date', 'Day', 'Hours', 'Activity', 'Notes'],
  widths: [24, 25, 13, 14, 9, 88.29, 36.71],
  pdfWidths: [108, 112, 56, 58, 34, 0, 130],
  lastColumn: 'G',
};

const SUMMARY_LAYOUT: Layout = {
  title: 'HOURS SUMMARY',
  headers: ['Resource', 'Period', 'Date', 'Day', 'Hours'],
  widths: [24, 36, 16, 16, 18],
  pdfWidths: [0, 200, 110, 110, 80],
  lastColumn: 'E',
};

function layoutOf(log: ActivityLog): Layout {
  return log.costs ? SUMMARY_LAYOUT : DETAIL_LAYOUT;
}

function formatAmount(value: number, currency: string): string {
  return `${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function rowValues(log: ActivityLog, entry: ActivityLogRow): string[] {
  const base = [
    log.code,
    periodLabel(log),
    displayDate(entry.date),
    weekday(entry.date),
    String(entry.hours),
  ];

  return log.costs ? base : [...base, entry.activity, entry.note ?? ''];
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
  return log.rows.reduce((total, row) => total + row.hours, 0);
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
      printTitlesRow: '1:6',
    },
  });

  const layout = layoutOf(log);
  sheet.columns = layout.widths.map((width) => ({ width }));

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
    for (let column = 1; column <= layout.headers.length; column += 1) {
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
  project.getCell(4).value = 'Monthly hours';
  project.getCell(5).value = log.monthlyHours;
  project.getCell(1).font = { bold: true };
  project.getCell(4).font = { bold: true };

  const workday = sheet.getRow(3);
  styleRow(workday);
  workday.getCell(1).value = 'Schedule';
  workday.getCell(2).value = workdayLabel(log);
  workday.getCell(1).font = { bold: true };

  const costs = sheet.getRow(4);
  styleRow(costs);

  if (log.costs) {
    const amountFormat = `#,##0.00 "${log.costs.currency}"`;
    workday.getCell(4).value = 'Hourly cost';
    workday.getCell(4).font = { bold: true };
    workday.getCell(5).value = log.costs.hourlyRate;
    workday.getCell(5).numFmt = amountFormat;
    costs.getCell(4).value = 'Total cost';
    costs.getCell(4).font = { bold: true };
    costs.getCell(5).value = log.costs.amount;
    costs.getCell(5).numFmt = amountFormat;
  }

  sheet.mergeCells(`A5:${layout.lastColumn}5`);
  const period = sheet.getCell('A5');
  period.value = periodTitle(log);
  period.font = whiteBold;
  period.fill = fill(COLORS.period);
  period.alignment = wrapTop;
  period.border = rule;

  const header = sheet.getRow(6);
  layout.headers.forEach((label, index) => {
    const cell = header.getCell(index + 1);
    cell.value = label;
    cell.font = whiteBold;
    cell.fill = fill(COLORS.header);
    cell.alignment = wrapTop;
    cell.border = rule;
  });

  const firstDataRow = 7;
  log.rows.forEach((entry, index) => {
    const row = sheet.getRow(firstDataRow + index);
    styleRow(row);
    row.getCell(1).value = log.code;
    row.getCell(2).value = periodLabel(log);
    row.getCell(3).value = utcDate(entry.date);
    row.getCell(3).numFmt = 'mm/dd/yyyy';
    row.getCell(4).value = weekday(entry.date);
    row.getCell(5).value = entry.hours;
    if (!log.costs) {
      row.getCell(6).value = entry.activity;
      row.getCell(7).value = entry.note ?? null;
    }
  });

  const lastDataRow = firstDataRow + Math.max(log.rows.length, 1) - 1;
  const totalRow = sheet.getRow(lastDataRow + 1);
  styleRow(totalRow);
  totalRow.getCell(4).value = 'TOTAL';
  totalRow.getCell(4).font = { bold: true };
  totalRow.getCell(5).value = {
    formula: `SUM(E${firstDataRow}:E${lastDataRow})`,
    result: totalHours(log),
  };
  totalRow.getCell(5).font = { bold: true };

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
    const fixed = layout.pdfWidths.reduce((sum, value) => sum + value, 0);
    const columns = layout.pdfWidths.map((value) => value || width - fixed);
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

    const cells = (values: string[], options: { bold?: boolean; fillColor?: string }) => {
      doc.font(options.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize);
      const height =
        Math.max(
          ...values.map((value, index) =>
            doc.heightOfString(value || ' ', { width: columns[index]! - padding * 2 }),
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
              .text(value, x + padding, y + padding, { width: columns[index]! - padding * 2 });
            x += columns[index]!;
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
      place(cells(layout.headers, { bold: true, fillColor: COLORS.header }));

    band(`${layout.title} — ${log.code}`, COLORS.title, 14, 'center');
    doc.moveDown(0.6);

    doc.fillColor(`#${COLORS.ink}`).fontSize(9);
    const info: [string, string][] = [
      ['Project', log.projectName],
      ['Monthly hours', String(log.monthlyHours)],
      ['Schedule', workdayLabel(log)],
      ...(log.costs
        ? ([
            ['Hourly cost', formatAmount(log.costs.hourlyRate, log.costs.currency)],
            ['Total cost', formatAmount(log.costs.amount, log.costs.currency)],
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

    doc.moveDown(0.4);
    band(periodTitle(log), COLORS.period, 10, 'left');
    doc.moveDown(0.2);
    header();

    for (const entry of log.rows) {
      const row = cells(rowValues(log, entry), {});

      if (doc.y + row.height > bottom) {
        doc.addPage();
        header();
      }

      place(row);
    }

    const total = cells(
      layout.headers.map((_, index) =>
        index === 3 ? 'TOTAL' : index === 4 ? String(totalHours(log)) : '',
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
