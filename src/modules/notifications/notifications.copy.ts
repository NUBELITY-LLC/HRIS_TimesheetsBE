import type { ClaimedNotificationEmail } from './notifications.repository.js';
import type { EmailContent, EmailLocale } from './notifications.templates.js';

export type NotificationCopy = Omit<EmailContent, 'locale' | 'recipientName' | 'action'> & {
  subject: string;
  action: { label: string; path: string };
};

const INTL_LOCALES: Record<EmailLocale, string> = { es: 'es-MX', en: 'en-US' };

export function toEmailLocale(value: string | null | undefined): EmailLocale {
  return value === 'en' ? 'en' : 'es';
}

function parseIsoDate(isoDate: string): Date {
  return new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
}

export function formatDate(isoDate: string, locale: EmailLocale): string {
  return new Intl.DateTimeFormat(INTL_LOCALES[locale], {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parseIsoDate(isoDate));
}

function formatDayMonth(isoDate: string, locale: EmailLocale): string {
  return new Intl.DateTimeFormat(INTL_LOCALES[locale], {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(parseIsoDate(isoDate));
}

function formatHours(hours: number | null, locale: EmailLocale): string | null {
  if (hours === null) return null;
  return new Intl.NumberFormat(INTL_LOCALES[locale], { maximumFractionDigits: 2 }).format(
    Number(hours),
  );
}

function formatWeek(email: ClaimedNotificationEmail, locale: EmailLocale): string | null {
  if (!email.weekStart || !email.weekEnd) return null;

  const sameYear = email.weekStart.slice(0, 4) === email.weekEnd.slice(0, 4);
  const sameMonth = sameYear && email.weekStart.slice(5, 7) === email.weekEnd.slice(5, 7);

  if (sameMonth) {
    const startDay = Number(email.weekStart.slice(8, 10));
    const endDay = Number(email.weekEnd.slice(8, 10));
    const year = email.weekEnd.slice(0, 4);

    return locale === 'en'
      ? `${formatDayMonth(email.weekStart, locale)} to ${endDay}, ${year}`
      : `del ${startDay} al ${formatDate(email.weekEnd, locale)}`;
  }

  const start = sameYear
    ? formatDayMonth(email.weekStart, locale)
    : formatDate(email.weekStart, locale);
  const end = formatDate(email.weekEnd, locale);

  return locale === 'en' ? `${start} to ${end}` : `del ${start} al ${end}`;
}

function formatList(items: string[], locale: EmailLocale): string {
  return new Intl.ListFormat(INTL_LOCALES[locale], { style: 'long', type: 'conjunction' }).format(
    items,
  );
}

const LABELS = {
  es: {
    folio: 'Folio',
    consultant: 'Consultor',
    project: 'Proyecto',
    projects: 'Proyectos',
    company: 'Empresa',
    client: 'Gerente',
    week: 'Semana',
    hours: 'Horas',
    start: 'Inicio',
    logHours: 'Capturar horas',
    review: 'Revisar timesheet',
    view: 'Ver timesheet',
    notifications: 'Ver notificaciones',
  },
  en: {
    folio: 'Reference',
    consultant: 'Consultant',
    project: 'Project',
    projects: 'Projects',
    company: 'Company',
    client: 'Manager',
    week: 'Week',
    hours: 'Hours',
    start: 'Start date',
    logHours: 'Log hours',
    review: 'Review timesheet',
    view: 'View timesheet',
    notifications: 'View notifications',
  },
} as const;

function timesheetDetails(
  email: ClaimedNotificationEmail,
  locale: EmailLocale,
  week: string,
): EmailContent['details'] {
  const labels = LABELS[locale];
  return [
    [labels.folio, email.submissionCode],
    [labels.consultant, email.kind === 'REVIEW_REQUESTED' ? email.consultantName : null],
    [labels.project, email.projectName],
    [labels.company, email.companyName],
    [labels.client, email.clientName],
    [labels.week, week.replace(/^del /, '')],
    [labels.hours, formatHours(email.totalHours, locale)],
  ];
}

function historyPath(email: ClaimedNotificationEmail): string {
  return email.timesheetId ? `/history/${email.timesheetId}` : '/history';
}

function taskAssigned(email: ClaimedNotificationEmail, locale: EmailLocale): NotificationCopy | null {
  if (!email.projectName || !email.startDate) return null;

  const labels = LABELS[locale];
  const start = formatDate(email.startDate, locale);
  const subject =
    locale === 'en'
      ? `You've been assigned to ${email.projectName}`
      : `Te asignaron al proyecto ${email.projectName}`;

  return {
    subject,
    heading: subject,
    paragraphs: [
      locale === 'en'
        ? `Starting ${start}, you can log your hours on this project.`
        : `A partir del ${start} podrás registrar tus horas en este proyecto.`,
    ],
    details: [
      [labels.project, email.projectName],
      [labels.company, email.companyName],
      [labels.client, email.clientName],
      [labels.start, start],
    ],
    action: { label: labels.logHours, path: '/timesheets' },
  };
}

function reminder(email: ClaimedNotificationEmail, locale: EmailLocale): NotificationCopy | null {
  const week = formatWeek(email, locale);
  if (!week) return null;

  const labels = LABELS[locale];
  const projects = email.projectNames?.length ? formatList(email.projectNames, locale) : null;
  const subject =
    locale === 'en' ? 'You have hours pending submission' : 'Tienes horas pendientes de enviar';

  return {
    subject,
    heading: subject,
    paragraphs: [
      locale === 'en'
        ? `You haven't submitted your timesheet for the week of ${week}.`
        : `Aún no envías tu timesheet de la semana ${week}.`,
    ],
    details: [[labels.projects, projects]],
    action: { label: labels.logHours, path: '/timesheets' },
  };
}

function reviewRequested(
  email: ClaimedNotificationEmail,
  locale: EmailLocale,
): NotificationCopy | null {
  const week = formatWeek(email, locale);
  if (!email.submissionCode || !week) return null;

  const consultant = email.consultantName;
  const subject =
    locale === 'en'
      ? `Timesheet ${email.submissionCode} is waiting for your review`
      : `Timesheet ${email.submissionCode} pendiente de tu revisión`;

  let paragraph: string;
  if (locale === 'en') {
    paragraph = consultant
      ? `${consultant}'s timesheet for the week of ${week} is waiting for your review.`
      : `A timesheet for the week of ${week} is waiting for your review.`;
  } else {
    paragraph = consultant
      ? `El timesheet de ${consultant} de la semana ${week} está esperando tu revisión.`
      : `Un timesheet de la semana ${week} está esperando tu revisión.`;
  }

  return {
    subject,
    heading: subject,
    paragraphs: [paragraph],
    details: timesheetDetails(email, locale, week),
    action: { label: LABELS[locale].review, path: '/reviews' },
  };
}

function approved(email: ClaimedNotificationEmail, locale: EmailLocale): NotificationCopy | null {
  const week = formatWeek(email, locale);
  if (!email.submissionCode || !week) return null;

  const subject =
    locale === 'en'
      ? `Timesheet ${email.submissionCode} approved`
      : `Timesheet ${email.submissionCode} aprobado`;

  return {
    subject,
    heading: subject,
    paragraphs: [
      locale === 'en'
        ? `Your timesheet for the week of ${week} has been fully approved.`
        : `Tu timesheet de la semana ${week} completó el flujo de aprobación.`,
    ],
    details: timesheetDetails(email, locale, week),
    action: { label: LABELS[locale].view, path: historyPath(email) },
  };
}

function rejected(email: ClaimedNotificationEmail, locale: EmailLocale): NotificationCopy | null {
  const week = formatWeek(email, locale);
  if (!email.submissionCode || !week) return null;

  const subject =
    locale === 'en'
      ? `Timesheet ${email.submissionCode} returned`
      : `Timesheet ${email.submissionCode} devuelto`;
  const paragraphs = [
    locale === 'en'
      ? `Your timesheet for the week of ${week} needs corrections.`
      : `Tu timesheet de la semana ${week} necesita correcciones.`,
  ];

  if (email.comments) {
    paragraphs.push(locale === 'en' ? `Reason: ${email.comments}` : `Motivo: ${email.comments}`);
  }

  return {
    subject,
    heading: subject,
    paragraphs,
    details: timesheetDetails(email, locale, week),
    action: { label: LABELS[locale].view, path: historyPath(email) },
  };
}

const BUILDERS: Record<
  string,
  (email: ClaimedNotificationEmail, locale: EmailLocale) => NotificationCopy | null
> = {
  TASK_ASSIGNED: taskAssigned,
  REMINDER: reminder,
  REVIEW_REQUESTED: reviewRequested,
  APPROVED: approved,
  REJECTED: rejected,
};

export function notificationCopy(
  email: ClaimedNotificationEmail,
  locale: EmailLocale,
): NotificationCopy {
  const built = email.kind ? BUILDERS[email.kind]?.(email, locale) : null;
  if (built) return built;

  return {
    subject: email.title,
    heading: email.title,
    paragraphs: email.body ? [email.body] : [],
    action: { label: LABELS[locale].notifications, path: '/notifications' },
  };
}
