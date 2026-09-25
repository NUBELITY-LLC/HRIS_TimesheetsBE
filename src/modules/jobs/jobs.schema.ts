import { z } from 'zod';

export const timesheetRemindersQuerySchema = z.object({
  weekStart: z.iso.date().optional(),
});

export type TimesheetRemindersQuery = z.infer<typeof timesheetRemindersQuerySchema>;
