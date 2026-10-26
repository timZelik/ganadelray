import { z } from 'zod';

const booleanFromString = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

const base64EncryptionKey = z
  .string()
  .refine((value) => Buffer.from(value, 'base64').length === 32, 'TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32)');

/** Published in docker-compose.yml so a clean clone runs; refused in production. */
export const developmentOnlyEncryptionKey = 'ZmFub3V0LWRldmVsb3BtZW50LW9ubHkta2V5LTMyYic=';

export const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  LOG_PRETTY: booleanFromString.default(false),

  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),

  S3_ENDPOINT: z.url().optional(),
  S3_PUBLIC_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: booleanFromString.default(true),

  TOKEN_ENCRYPTION_KEY: base64EncryptionKey,

  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().positive().default(3000),

  HUB_DIRECTORY: z.string().default('./hub'),
  WATCH_INTERVAL_SECONDS: z.coerce.number().int().positive().default(15),
  /** A hub file must be unchanged this long before ingest, so half-copied exports are skipped. */
  HUB_SETTLE_SECONDS: z.coerce.number().nonnegative().default(5),
  PUBLISH_DRY_RUN: booleanFromString.default(true),
  /** X charges extra for posts containing URLs; strip them from X captions. */
  X_COST_SAVING_MODE: booleanFromString.default(true),
  RENDERED_ASSET_RETENTION_DAYS: z.coerce.number().int().positive().default(7),
  PRESIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().default(24 * 60 * 60),
  MINIMUM_SOURCE_DURATION_SECONDS: z.coerce.number().nonnegative().default(1),
  MEDIA_WORK_DIRECTORY: z.string().default('/tmp/fanout-media'),
  MEDIA_CONCURRENCY: z.coerce.number().int().positive().default(2),

  FFMPEG_PATH: z.string().default('ffmpeg'),
  FFPROBE_PATH: z.string().default('ffprobe'),
}).refine((environment) => !(environment.NODE_ENV === 'production' && environment.TOKEN_ENCRYPTION_KEY === developmentOnlyEncryptionKey), {
  path: ['TOKEN_ENCRYPTION_KEY'],
  message: 'The development-only key from docker-compose.yml must not be used in production; generate one with: openssl rand -base64 32',
});

export type Environment = z.infer<typeof environmentSchema>;
