import { z } from 'zod';
import { environmentSchema, type Environment } from './environmentSchema.ts';

/** Parses the process environment once at startup; a misconfiguration fails fast with every problem listed. */
export function loadEnvironment(source: Record<string, string | undefined> = process.env): Environment {
  const parsed = environmentSchema.safeParse(source);
  if (!parsed.success) throw new Error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
  return parsed.data;
}
