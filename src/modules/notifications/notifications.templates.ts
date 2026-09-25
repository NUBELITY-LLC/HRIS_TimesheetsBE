export type EmailContent = {
  recipientName: string | null;
  heading: string;
  paragraphs: string[];
  details?: [label: string, value: string | null | undefined][];
  action?: { label: string; url: string } | null;
  footnote?: string | null;
};

const BRAND = 'Nubelity HRIS';
const CLOSING = `Recibes este correo porque tienes una cuenta en ${BRAND}.`;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function presentDetails(content: EmailContent): [string, string][] {
  return (content.details ?? []).filter(
    (detail): detail is [string, string] => typeof detail[1] === 'string' && detail[1] !== '',
  );
}

function greeting(content: EmailContent): string {
  return content.recipientName ? `Hola ${content.recipientName},` : 'Hola,';
}

function renderText(content: EmailContent): string {
  const lines = [greeting(content), '', ...content.paragraphs];
  const details = presentDetails(content);

  if (details.length) {
    lines.push('', ...details.map(([label, value]) => `${label}: ${value}`));
  }

  if (content.action) {
    lines.push('', `${content.action.label}: ${content.action.url}`);
  }

  if (content.footnote) {
    lines.push('', content.footnote);
  }

  lines.push('', '--', CLOSING);

  return lines.join('\n');
}

function renderHtml(content: EmailContent): string {
  const details = presentDetails(content);
  const paragraphs = content.paragraphs
    .map((text) => `<p style="margin:0 0 12px">${escapeHtml(text)}</p>`)
    .join('');
  const detailRows = details
    .map(
      ([label, value]) =>
        `<tr><td style="padding:4px 16px 4px 0;color:#6b7280;white-space:nowrap">${escapeHtml(label)}</td>` +
        `<td style="padding:4px 0;color:#111827">${escapeHtml(value)}</td></tr>`,
    )
    .join('');
  const action = content.action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(content.action.url)}" ` +
      'style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;' +
      `padding:10px 18px;border-radius:8px;font-weight:600">${escapeHtml(content.action.label)}</a></p>`
    : '';
  const footnote = content.footnote
    ? `<p style="margin:0 0 12px;color:#6b7280;font-size:13px">${escapeHtml(content.footnote)}</p>`
    : '';

  return (
    '<!doctype html><html><body style="margin:0;background:#f3f4f6;padding:24px 12px;' +
    'font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#111827">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" ' +
    'style="max-width:560px;background:#ffffff;border-radius:12px;padding:28px">' +
    `<tr><td><p style="margin:0 0 20px;font-size:13px;font-weight:600;color:#2563eb">${BRAND}</p>` +
    `<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3">${escapeHtml(content.heading)}</h1>` +
    `<p style="margin:0 0 12px">${escapeHtml(greeting(content))}</p>` +
    paragraphs +
    (detailRows
      ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:16px 0">${detailRows}</table>`
      : '') +
    action +
    footnote +
    `<p style="margin:24px 0 0;color:#9ca3af;font-size:12px">${CLOSING}</p>` +
    '</td></tr></table></td></tr></table></body></html>'
  );
}

export function renderEmail(content: EmailContent): { text: string; html: string } {
  return { text: renderText(content), html: renderHtml(content) };
}
