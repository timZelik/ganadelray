import { randomUUID } from 'node:crypto';
import { pino, type Logger, type LoggerOptions } from 'pino';
import { redactedPlaceholder } from './redaction.ts';

export type { Logger } from 'pino';

const redactedPaths = [
  '*.accessToken', '*.refreshToken', '*.access_token', '*.refresh_token', '*.apiKey', '*.clientSecret', '*.password',
  '*.tokenSet', 'headers.authorization', '*.headers.authorization', 'request.headers.authorization',
];

export interface CreateLoggerOptions {
  serviceName: string;
  level?: LoggerOptions['level'];
  pretty?: boolean;
}

export function createLogger({ serviceName, level = 'info', pretty = false }: CreateLoggerOptions): Logger {
  return pino({
    name: serviceName,
    level,
    redact: { paths: redactedPaths, censor: redactedPlaceholder },
    ...(pretty ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : {}),
  });
}

export function createCorrelationId(): string {
  return randomUUID();
}

/** Every job and request gets a child logger so all lines it emits share one correlation ID. */
export function withCorrelationId(logger: Logger, correlationId: string, bindings: Record<string, unknown> = {}): Logger {
  return logger.child({ correlationId, ...bindings });
}
