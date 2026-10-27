import { z } from 'zod';

export const sessionResponseSchema = z.object({
  user: z.object({ name: z.string(), email: z.string() }),
});
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
