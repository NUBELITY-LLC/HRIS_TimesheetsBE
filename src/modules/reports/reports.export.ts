import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import type { ExportFormat, ExportedFile } from '../timesheets/timesheets.export.js';
import type { PeriodGroup } from './reports.schema.js';
import type {
  CompanyEntry,
  CompanyPersonView,
  CompanyReportView,
  HoursReportView,
  ReportTotalView,
} from './reports.service.js';

const COLORS = {
  title: '17365D',
  section: '2F75B5',
  header: '5B9BD5',
  rule: 'D9E2F3',
  total: 'EEF3FA',
  white: 'FFFFFF',
  ink: '1F2937',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  IN_REVIEW: 'In review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CLOSED: 'Closed',
  PAID: 'Paid',
};

const GROUP_LABELS: Record<PeriodGroup, string> = {
  fortnight: 'Biweekly',
  month: 'Monthly',
  year: 'Yearly',
};

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type Money = { amount: number; currency: string };
type CellValue = string | number | Money | null;
type CellKind = 'text' | 'date' | 'hours' | 'money' | 'number';

type Column = {
  header: string;
  kind: CellKind;
  width: number;
  pdfWidth: number;
  sum?: boolean;
};

type Section = {
  sheet: string;
  heading: string;
  columns: Column[];
  rows: CellValue[][];
  pdf: boolean;
};

type ReportDocument = {
  title: string;
  info: [string, string][];
  sections: Section[];
  fileName: string;
};

export type HoursScope = { companyName: string | null; projectName: string | null };

export type CompanyExportOptions = {
  byProject: boolean;
  byPerson: boolean;
  groupBy: PeriodGroup;
  projectName: string | null;
  personName: string | null;
};

function isMoney(value: CellValue): value is Money {
  return typeof value === 'object' && value !== null;
}

function displayDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${month}/${day}/${year}`;
}

function utcDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!));
}

function formatHours(minutes: number): string {
  const total = Math.round(minutes);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function formatAmount(amount: number, currency: string): string {
  const value = amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency ? `${value} ${currency}` : value;
}

function totalsLabel(totals: ReportTotalView[]): string {
  return totals.length
    ? totals.map((total) => formatAmount(total.amount, total.currency)).join(' · ')
    : '—';
}

function rangeLabel(from: string, to: string): string {
  return `${displayDate(from)} – ${displayDate(to)}`;
}

function slug(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'report'
  );
}

function columnLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

function moneyFormat(currency: string): string {
  return currency ? `#,##0.00 "${currency}"` : '#,##0.00';
}

function sumColumn(rows: CellValue[][], index: number): CellValue {
  const values = rows
    .map((row) => row[index] ?? null)
    .filter((value): value is Exclude<CellValue, null> => value !== null);

  if (values.every((value) => typeof value === 'number')) {
    return (values as number[]).reduce((total, value) => total + value, 0);
  }

  const money = values.filter(isMoney);
  const currencies = new Set(money.map((value) => value.currency));
  if (currencies.size !== 1) return null;

  return {
    amount: Math.round(money.reduce((total, value) => total + value.amount, 0) * 100) / 100,
    currency: money[0]!.currency,
  };
}

function totalsRow(section: Section): CellValue[] {
  return section.columns.map((column, index) =>
    index === 0 ? 'TOTAL' : column.sum ? sumColumn(section.rows, index) : null,
  );
}

function displayCell(column: Column, value: CellValue): string {
  if (value === null) return '';
  if (isMoney(value)) return formatAmount(value.amount, value.currency);
  if (column.kind === 'date' && typeof value === 'string' && ISO_DATE.test(value)) {
    return displayDate(value);
  }
  if (column.kind === 'hours' && typeof value === 'number') return formatHours(value);
  return String(value);
}

function writeCell(cell: ExcelJS.Cell, column: Column, value: CellValue): void {
  if (value === null) return;

  if (isMoney(value)) {
    cell.value = value.amount;
    cell.numFmt = moneyFormat(value.currency);
  } else if (column.kind === 'date' && typeof value === 'string') {
    cell.value = utcDate(value);
    cell.numFmt = 'mm/dd/yyyy';
  } else if (column.kind === 'hours' && typeof value === 'number') {
    cell.value = value / 1440;
    cell.numFmt = '[h]:mm';
  } else {
    cell.value = value;
  }
}

async function renderXlsx(document: ReportDocument): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const rule: Partial<ExcelJS.Borders> = {
    bottom: { style: 'thin', color: { argb: `FF${COLORS.rule}` } },
  };
  const fill = (color: string): ExcelJS.Fill => ({
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: `FF${color}` },
  });
  const whiteBold = { bold: true, color: { argb: `FF${COLORS.white}` }, name: 'Calibri' };

  document.sections.forEach((section, sectionIndex) => {
    const sheet = workbook.addWorksheet(section.sheet.slice(0, 31), {
      views: [{ showGridLines: false }],
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    const count = section.columns.length;
    const last = columnLetter(count - 1);
    sheet.columns = section.columns.map((column) => ({ width: column.width }));

    sheet.mergeCells(`A1:${last}1`);
    const title = sheet.getCell('A1');
    title.value = document.title;
    title.font = { ...whiteBold, size: 14 };
    title.fill = fill(COLORS.title);
    title.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 22;

    let rowNumber = 2;

    if (sectionIndex === 0) {
      for (const [label, value] of document.info) {
        const row = sheet.getRow(rowNumber);
        row.getCell(1).value = label;
        row.getCell(1).font = { bold: true };
        if (count > 2) sheet.mergeCells(`B${rowNumber}:${last}${rowNumber}`);
        row.getCell(2).value = value;
        for (let column = 1; column <= count; column += 1) row.getCell(column).border = rule;
        rowNumber += 1;
      }
    }

    rowNumber += 1;
    sheet.mergeCells(`A${rowNumber}:${last}${rowNumber}`);
    const heading = sheet.getCell(`A${rowNumber}`);
    heading.value = section.heading;
    heading.font = whiteBold;
    heading.fill = fill(COLORS.section);
    rowNumber += 1;

    const headerRow = rowNumber;
    const header = sheet.getRow(headerRow);
    section.columns.forEach((column, index) => {
      const cell = header.getCell(index + 1);
      cell.value = column.header;
      cell.font = whiteBold;
      cell.fill = fill(COLORS.header);
      cell.alignment = {
        vertical: 'middle',
        wrapText: true,
        horizontal: column.kind === 'text' || column.kind === 'date' ? 'left' : 'right',
      };
    });
    rowNumber += 1;

    const firstDataRow = rowNumber;
    for (const values of section.rows) {
      const row = sheet.getRow(rowNumber);
      section.columns.forEach((column, index) => {
        const cell = row.getCell(index + 1);
        writeCell(cell, column, values[index] ?? null);
        cell.border = rule;
        cell.alignment = { vertical: 'top', wrapText: column.kind === 'text' };
      });
      rowNumber += 1;
    }
    const lastDataRow = Math.max(rowNumber - 1, firstDataRow);

    const totals = totalsRow(section);
    const totalRow = sheet.getRow(rowNumber);
    section.columns.forEach((column, index) => {
      const cell = totalRow.getCell(index + 1);
      const value = totals[index] ?? null;
      const letter = columnLetter(index);

      if (index > 0 && value !== null) {
        writeCell(cell, column, value);
        const result = cell.value as number;
        cell.value = {
          formula: `SUBTOTAL(109,${letter}${firstDataRow}:${letter}${lastDataRow})`,
          result,
        };
      } else if (index === 0) {
        cell.value = 'TOTAL';
      }

      cell.font = { bold: true };
      cell.fill = fill(COLORS.total);
      cell.border = rule;
    });

    sheet.autoFilter = {
      from: { row: headerRow, column: 1 },
      to: { row: lastDataRow, column: count },
    };
    sheet.views = [{ state: 'frozen', ySplit: headerRow, showGridLines: false }];
  });

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function renderPdf(document: ReportDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', layout: 'landscape', margin: 36 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const bottom = doc.page.height - doc.page.margins.bottom;
    const padding = 4;
    const fontSize = 8;

    const band = (text: string, color: string, size: number, align: 'left' | 'center') => {
      doc.font('Helvetica-Bold').fontSize(size);
      const height = doc.heightOfString(text, { width: width - padding * 2 }) + padding * 2;
      if (doc.y + height > bottom) doc.addPage();
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

    band(document.title, COLORS.title, 14, 'center');
    doc.moveDown(0.6);

    doc.fillColor(`#${COLORS.ink}`).fontSize(9);
    for (const [label, value] of document.info) {
      const y = doc.y;
      doc.font('Helvetica-Bold').text(label, left, y, { width: 120 });
      doc.font('Helvetica').text(value, left + 130, y, { width: width - 130 });
      doc.y = Math.max(doc.y, y + 12) + 2;
      rule(doc.y);
      doc.y += 4;
    }

    for (const section of document.sections.filter((candidate) => candidate.pdf)) {
      const visible = section.columns
        .map((column, index) => ({ column, index }))
        .filter(({ column }) => column.pdfWidth >= 0);
      const fixed = visible.reduce((sum, { column }) => sum + column.pdfWidth, 0);
      const widths = visible.map(({ column }) => column.pdfWidth || width - fixed);

      const cells = (values: string[], options: { bold?: boolean; fillColor?: string }) => {
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
              const kind = visible[index]!.column.kind;
              doc
                .fillColor(
                  options.fillColor === COLORS.header ? `#${COLORS.white}` : `#${COLORS.ink}`,
                )
                .text(value, x + padding, y + padding, {
                  width: widths[index]! - padding * 2,
                  align: kind === 'text' || kind === 'date' ? 'left' : 'right',
                });
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
            visible.map(({ column }) => column.header),
            { bold: true, fillColor: COLORS.header },
          ),
        );

      doc.moveDown(0.6);
      band(section.heading, COLORS.section, 10, 'left');
      header();

      const rows = [
        ...section.rows.map((values) => ({ values, bold: false })),
        { values: totalsRow(section), bold: true },
      ];

      for (const { values, bold } of rows) {
        const row = cells(
          visible.map(({ column, index }) => displayCell(column, values[index] ?? null)),
          bold ? { bold, fillColor: COLORS.total } : {},
        );

        if (doc.y + row.height > bottom) {
          doc.addPage();
          header();
        }

        place(row);
      }
    }

    doc.end();
  });
}

async function render(document: ReportDocument, format: ExportFormat): Promise<ExportedFile> {
  if (format === 'pdf') {
    return {
      fileName: `${document.fileName}.pdf`,
      contentType: 'application/pdf',
      body: await renderPdf(document),
    };
  }

  return {
    fileName: `${document.fileName}.xlsx`,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    body: await renderXlsx(document),
  };
}

function money(amount: number, currency: string): Money {
  return { amount, currency };
}

function amountColumns(totals: ReportTotalView[], pdfWidth: number): Column[] {
  const currencies = totals.length ? totals.map((total) => total.currency) : [''];

  return currencies.map((currency) => ({
    header: currencies.length > 1 ? `Amount (${currency})` : 'Amount',
    kind: 'money',
    width: 16,
    pdfWidth,
    sum: true,
  }));
}

function amountCells(totals: ReportTotalView[], currencies: ReportTotalView[]): Money[] {
  const list = currencies.length ? currencies.map((total) => total.currency) : [''];

  return list.map((currency) =>
    money(totals.find((total) => total.currency === currency)?.amount ?? 0, currency),
  );
}

function ratesLabel(person: CompanyPersonView): string {
  const currency = person.totals[0]?.currency ?? '';
  const rates = person.hourlyRates;

  if (!rates.length) return '—';
  if (rates.length === 1) return formatAmount(rates[0]!, currency);

  return `${formatAmount(rates[0]!, '')} – ${formatAmount(rates[rates.length - 1]!, currency)}`;
}

export function renderHoursReport(
  report: HoursReportView,
  scope: HoursScope,
  format: ExportFormat,
): Promise<ExportedFile> {
  const entries = report.days.flatMap((day) =>
    day.entries.map((entry) => ({ date: day.date, entry })),
  );

  const columns: Column[] = [
    { header: 'Date', kind: 'date', width: 13, pdfWidth: 56 },
    { header: 'Company', kind: 'text', width: 22, pdfWidth: 80 },
    { header: 'Client', kind: 'text', width: 22, pdfWidth: -1 },
    { header: 'Project', kind: 'text', width: 26, pdfWidth: 0 },
    { header: 'Project code', kind: 'text', width: 14, pdfWidth: -1 },
    { header: 'Assignment ID', kind: 'text', width: 22, pdfWidth: 90 },
    { header: 'Submission', kind: 'text', width: 22, pdfWidth: 95 },
    { header: 'Status', kind: 'text', width: 12, pdfWidth: 60 },
    { header: 'Hours', kind: 'hours', width: 10, pdfWidth: 40, sum: true },
    { header: 'Hourly rate', kind: 'money', width: 16, pdfWidth: 70 },
    { header: 'Amount', kind: 'money', width: 16, pdfWidth: 75, sum: true },
  ];

  const rows: CellValue[][] = entries.map(({ date, entry }) => [
    date,
    entry.company?.name ?? '',
    entry.client?.name ?? '',
    entry.project?.name ?? '',
    entry.project?.code ?? '',
    entry.assignmentCode ?? '',
    entry.submissionCode ?? '',
    STATUS_LABELS[entry.status] ?? entry.status,
    entry.minutes,
    money(entry.hourlyRate, entry.currency),
    money(entry.amount, entry.currency),
  ]);

  const name = report.person.fullName;

  return render(
    {
      title: `HOURS REPORT — ${name}`,
      info: [
        ['Collaborator', name],
        ['Job title', report.person.jobTitle ?? '—'],
        ['Period', rangeLabel(report.from, report.to)],
        ['Company', scope.companyName ?? 'All companies'],
        ['Project', scope.projectName ?? 'All projects'],
        ['Hours worked', formatHours(report.totalMinutes)],
        ['Days with hours', String(report.workedDays)],
        ['Total amount', totalsLabel(report.totals)],
      ],
      sections: [
        { sheet: 'Hours', heading: 'DAILY DETAIL', columns, rows, pdf: true },
      ],
      fileName: `hours-report-${slug(name)}-${report.from}_${report.to}`,
    },
    format,
  );
}

function isoOf(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function lastDayOf(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function periodOf(iso: string, group: PeriodGroup): { from: string; to: string } {
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number];

  if (group === 'year') return { from: isoOf(year, 1, 1), to: isoOf(year, 12, 31) };
  if (group === 'month') {
    return { from: isoOf(year, month, 1), to: isoOf(year, month, lastDayOf(year, month)) };
  }

  return day <= 15
    ? { from: isoOf(year, month, 1), to: isoOf(year, month, 15) }
    : { from: isoOf(year, month, 16), to: isoOf(year, month, lastDayOf(year, month)) };
}

function periodsInRange(
  from: string,
  to: string,
  group: PeriodGroup,
): { from: string; to: string }[] {
  const periods: { from: string; to: string }[] = [];
  let cursor = from;

  while (cursor <= to) {
    const period = periodOf(cursor, group);
    periods.push({
      from: period.from < from ? from : period.from,
      to: period.to > to ? to : period.to,
    });
    const next = utcDate(period.to);
    next.setUTCDate(next.getUTCDate() + 1);
    cursor = next.toISOString().slice(0, 10);
  }

  return periods;
}

function periodLabel(from: string, to: string, group: PeriodGroup): string {
  const year = from.slice(0, 4);
  const month = MONTHS[Number(from.slice(5, 7)) - 1]!;

  if (group === 'year') return year;
  if (group === 'month') return `${month} ${year}`;

  return `${month.slice(0, 3)} ${Number(from.slice(8, 10))}–${Number(to.slice(8, 10))}, ${year}`;
}

export function renderCompanyReport(
  report: CompanyReportView,
  entries: CompanyEntry[],
  options: CompanyExportOptions,
  format: ExportFormat,
): Promise<ExportedFile> {
  const currencies = report.totals;
  const sections: Section[] = [];

  const periodRows: CellValue[][] = periodsInRange(report.from, report.to, options.groupBy).map(
    (period) => {
      const days = report.days.filter((day) => day.date >= period.from && day.date <= period.to);
      const totals = new Map<string, number>();
      for (const day of days) {
        for (const total of day.totals) {
          totals.set(total.currency, (totals.get(total.currency) ?? 0) + total.amount);
        }
      }

      return [
        periodLabel(period.from, period.to, options.groupBy),
        period.from,
        period.to,
        days.reduce((total, day) => total + day.minutes, 0),
        ...amountCells(
          [...totals.entries()].map(([currency, amount]) => ({
            currency,
            amount: Math.round(amount * 100) / 100,
          })),
          currencies,
        ),
      ];
    },
  );

  sections.push({
    sheet: 'Summary',
    heading: `BY PERIOD (${GROUP_LABELS[options.groupBy].toUpperCase()})`,
    columns: [
      { header: 'Period', kind: 'text', width: 26, pdfWidth: 0 },
      { header: 'From', kind: 'date', width: 13, pdfWidth: 80 },
      { header: 'To', kind: 'date', width: 13, pdfWidth: 80 },
      { header: 'Hours', kind: 'hours', width: 12, pdfWidth: 70, sum: true },
      ...amountColumns(currencies, 110),
    ],
    rows: periodRows,
    pdf: true,
  });

  if (options.byProject) {
    sections.push({
      sheet: 'By project',
      heading: 'BY PROJECT',
      columns: [
        { header: 'Project', kind: 'text', width: 30, pdfWidth: 0 },
        { header: 'Code', kind: 'text', width: 14, pdfWidth: 80 },
        { header: 'Client', kind: 'text', width: 28, pdfWidth: 160 },
        { header: 'Status', kind: 'text', width: 12, pdfWidth: 60 },
        { header: 'Hours', kind: 'hours', width: 12, pdfWidth: 60, sum: true },
        ...amountColumns(currencies, 100),
      ],
      rows: report.projects.map((project) => [
        project.name,
        project.code ?? '',
        project.clientName,
        project.isClosed ? 'Closed' : 'Active',
        project.minutes,
        ...amountCells(project.totals, currencies),
      ]),
      pdf: true,
    });
  }

  if (options.byPerson) {
    sections.push({
      sheet: 'By collaborator',
      heading: 'BY COLLABORATOR',
      columns: [
        { header: 'Collaborator', kind: 'text', width: 28, pdfWidth: 0 },
        { header: 'Job title', kind: 'text', width: 24, pdfWidth: 130 },
        { header: 'Days with hours', kind: 'number', width: 14, pdfWidth: 70 },
        { header: 'Hours', kind: 'hours', width: 12, pdfWidth: 60, sum: true },
        { header: 'Hourly rate', kind: 'text', width: 22, pdfWidth: 110 },
        ...amountColumns(currencies, 100),
      ],
      rows: report.people.map((person) => [
        person.fullName,
        person.jobTitle ?? '',
        person.workedDays,
        person.minutes,
        ratesLabel(person),
        ...amountCells(person.totals, currencies),
      ]),
      pdf: true,
    });
  }

  sections.push({
    sheet: 'Detail',
    heading: 'DAILY DETAIL',
    columns: [
      { header: 'Date', kind: 'date', width: 13, pdfWidth: -1 },
      { header: 'Project', kind: 'text', width: 26, pdfWidth: -1 },
      { header: 'Project code', kind: 'text', width: 14, pdfWidth: -1 },
      { header: 'Client', kind: 'text', width: 24, pdfWidth: -1 },
      { header: 'Collaborator', kind: 'text', width: 26, pdfWidth: -1 },
      { header: 'Assignment ID', kind: 'text', width: 22, pdfWidth: -1 },
      { header: 'Status', kind: 'text', width: 12, pdfWidth: -1 },
      { header: 'Hours', kind: 'hours', width: 10, pdfWidth: -1, sum: true },
      { header: 'Hourly rate', kind: 'money', width: 16, pdfWidth: -1 },
      { header: 'Amount', kind: 'money', width: 16, pdfWidth: -1, sum: true },
    ],
    rows: entries.map((entry) => [
      entry.date,
      entry.projectName,
      entry.projectCode ?? '',
      entry.clientName,
      entry.consultantName,
      entry.assignmentCode ?? '',
      STATUS_LABELS[entry.status] ?? entry.status,
      entry.minutes,
      money(entry.hourlyRate, entry.currency),
      money(entry.amount, entry.currency),
    ]),
    pdf: false,
  });

  const name = report.company.name;

  return render(
    {
      title: `HOURS REPORT — ${name}`,
      info: [
        ['Company', name],
        ['Period', rangeLabel(report.from, report.to)],
        ...(options.projectName ? ([['Project', options.projectName]] as [string, string][]) : []),
        ...(options.personName
          ? ([['Collaborator', options.personName]] as [string, string][])
          : []),
        ['Hours worked', formatHours(report.totalMinutes)],
        ['Total amount', totalsLabel(report.totals)],
        ['Projects', String(report.projectCount)],
        ['Collaborators', String(report.peopleCount)],
        ['Grouping', GROUP_LABELS[options.groupBy]],
      ],
      sections,
      fileName: `company-hours-${slug(name)}-${report.from}_${report.to}`,
    },
    format,
  );
}
