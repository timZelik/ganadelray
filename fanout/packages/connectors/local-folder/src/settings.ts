import { z } from 'zod';

export const localFolderSettingsSchema = z.object({ directory: z.string().min(1) });

export const localFolderCursorSchema = z.object({
  highWaterMarkMilliseconds: z.number(),
  externalIdsAtHighWaterMark: z.array(z.string()),
});
export type LocalFolderCursor = z.infer<typeof localFolderCursorSchema>;

export const emptyCursor: LocalFolderCursor = { highWaterMarkMilliseconds: 0, externalIdsAtHighWaterMark: [] };

export function parseCursor(cursor: unknown): LocalFolderCursor {
  const parsed = localFolderCursorSchema.safeParse(cursor);
  return parsed.success ? parsed.data : emptyCursor;
}
