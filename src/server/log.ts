// Small structured logger: console plus a daily file in the data dir.
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export type Level = 'debug' | 'info' | 'warn' | 'error';
const ORDER: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export interface LogSink {
  (level: Level, message: string, time: number): void;
}

export class Logger {
  private readonly dir: string | null;
  private readonly min: Level;
  private readonly sinks: LogSink[] = [];

  constructor(dir: string | null, min: Level = 'info') {
    this.dir = dir;
    this.min = min;
    if (dir) mkdirSync(join(dir, 'logs'), { recursive: true });
  }

  onLog(sink: LogSink): void {
    this.sinks.push(sink);
  }

  log(level: Level, message: string, extra?: unknown): void {
    if (ORDER[level] < ORDER[this.min]) return;
    const time = Date.now();
    const line = `${new Date(time).toISOString()} ${level.toUpperCase().padEnd(5)} ${message}${extra === undefined ? '' : ' ' + safe(extra)}`;
    (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(line);
    if (this.dir) {
      try {
        appendFileSync(join(this.dir, 'logs', `referee-${new Date(time).toISOString().slice(0, 10)}.log`), line + '\n');
      } catch {
        // Disk trouble must never take the referee down.
      }
    }
    for (const s of this.sinks) {
      try {
        s(level, extra === undefined ? message : `${message} ${safe(extra)}`, time);
      } catch {
        // a broken sink is not our problem
      }
    }
  }

  debug(m: string, x?: unknown): void {
    this.log('debug', m, x);
  }
  info(m: string, x?: unknown): void {
    this.log('info', m, x);
  }
  warn(m: string, x?: unknown): void {
    this.log('warn', m, x);
  }
  error(m: string, x?: unknown): void {
    this.log('error', m, x);
  }
}

function safe(x: unknown): string {
  if (x instanceof Error) return x.stack ?? x.message;
  try {
    return typeof x === 'string' ? x : JSON.stringify(x);
  } catch {
    return String(x);
  }
}
