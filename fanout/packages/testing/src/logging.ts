import { pino, type Logger } from 'pino';

export function createSilentLogger(): Logger {
  return pino({ level: 'silent' });
}
