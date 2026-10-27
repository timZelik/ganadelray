import { z } from 'zod';

const timeOfDayPattern = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A recurring daily publishing slot, e.g. weekdays at 09:30 in Europe/Berlin. */
export const scheduleSlotSchema = z.object({
  timeOfDay: z.string().regex(timeOfDayPattern, 'Expected HH:MM'),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).default([0, 1, 2, 3, 4, 5, 6]),
  timeZone: z.string().min(1).default('UTC'),
});
export type ScheduleSlot = z.infer<typeof scheduleSlotSchema>;
