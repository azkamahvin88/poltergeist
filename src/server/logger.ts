/**
 * logger.ts — Tiny structured logger.
 * Writes JSON lines to stderr. No console.log in server request paths.
 */

type Level = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

function log(level: Level, msg: string, fields?: Record<string, unknown>): void {
  const entry: Record<string, unknown> = {
    level,
    ts: new Date().toISOString(),
    msg,
    ...fields,
  };
  process.stderr.write(JSON.stringify(entry) + '\n');
}

export const logger = {
  debug: (msg: string, fields?: Record<string, unknown>) => log('DEBUG', msg, fields),
  info:  (msg: string, fields?: Record<string, unknown>) => log('INFO',  msg, fields),
  warn:  (msg: string, fields?: Record<string, unknown>) => log('WARN',  msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => log('ERROR', msg, fields),
};
