// Configuration lives in one JSON file in the data dir (default ~/.mytradepilot), mode 0600 because it holds
// the Alpaca keys. Environment variables override the Alpaca credentials so nothing has to be typed into the UI.
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { DEFAULT_RULES, type RuleSet } from '../engine/types.ts';
import { DEFAULT_PORT, DEFAULT_STRATEGY, type StrategyDefinition } from './api.ts';

const action = z.enum(['warn', 'flatten']);
const hhmm = z.string().regex(/^\d{1,2}:\d{2}$/, 'use HH:MM');

export const RuleSetSchema = z.object({
  maxTradesPerDay: z.object({ enabled: z.boolean(), count: z.number().int().min(1).max(500), action }),
  noReentryAfterLoss: z.object({ enabled: z.boolean(), minutes: z.number().min(0).max(1440), sameSymbolOnly: z.boolean(), action }),
  cooldownAfterLosses: z.object({ enabled: z.boolean(), losses: z.number().int().min(1).max(100), minutes: z.number().min(0).max(1440), action }),
  stopRequired: z.object({ enabled: z.boolean(), withinSeconds: z.number().min(1).max(3600), action }),
  stopNotWidened: z.object({ enabled: z.boolean(), action }),
  maxPositionDollars: z.object({ enabled: z.boolean(), dollars: z.number().min(1), action }),
  dailyLossLimit: z.object({ enabled: z.boolean(), dollars: z.number().min(1), action, lockRestOfDay: z.boolean() }),
  sessionWindow: z.object({ enabled: z.boolean(), start: hhmm, end: hhmm, action }),
  maxOpenPositions: z.object({ enabled: z.boolean(), count: z.number().int().min(1).max(100), action }),
  sizeMatchesDeclaration: z.object({ enabled: z.boolean(), tolerancePct: z.number().min(0).max(1000), action }),
  maxBreachesPerDay: z.object({ enabled: z.boolean(), count: z.number().int().min(1).max(100) }),
}) satisfies z.ZodType<RuleSet>;

export const StrategySchema = z.object({
  name: z.string().max(100),
  description: z.string().max(20000),
  indicators: z.string().max(2000),
  timeframe: z.enum(['1Min', '5Min', '15Min']),
  emaFast: z.number().int().min(2).max(200),
  emaSlow: z.number().int().min(3).max(400),
  requireTrend: z.boolean(),
  pullbackMaxPct: z.number().min(0).max(50),
  minDayChangePct: z.number().min(0).max(500),
  minRelativeVolume: z.number().min(0).max(100),
  minPrice: z.number().min(0),
  requireVwapSide: z.boolean(),
}) satisfies z.ZodType<StrategyDefinition>;

export const AlpacaCredsSchema = z.object({
  keyId: z.string().min(8).max(200),
  secretKey: z.string().min(8).max(400),
  mode: z.enum(['paper', 'live']),
});

export const ConfigSchema = z.object({
  alpaca: AlpacaCredsSchema.nullable().default(null),
  feed: z.enum(['iex', 'sip']).default('iex'),
  port: z.number().int().min(1).max(65535).default(DEFAULT_PORT),
  webhookUrl: z.string().url().max(2000).nullable().default(null),
  notifications: z.object({ desktop: z.boolean().default(true), sound: z.boolean().default(true) }).default({ desktop: true, sound: true }),
  declarationWindowMinutes: z.number().min(1).max(240).default(10),
  stopPct: z.number().min(0.1).max(50).default(2),
  importTimeZone: z.string().min(1).default('America/New_York'),
  enforcement: z
    .object({ enabled: z.boolean().default(true), dryRun: z.boolean().default(true), killedAt: z.number().nullable().default(null) })
    .default({ enabled: true, dryRun: true, killedAt: null }),
  rules: RuleSetSchema.default(DEFAULT_RULES),
  strategy: StrategySchema.default(DEFAULT_STRATEGY),
});

export type Config = z.infer<typeof ConfigSchema>;

export function dataDir(): string {
  return process.env.MYTRADEPILOT_HOME?.trim() || join(homedir(), '.mytradepilot');
}

export class ConfigStore {
  readonly dir: string;
  readonly file: string;
  private current: Config;

  constructor(dir = dataDir()) {
    this.dir = dir;
    this.file = join(dir, 'config.json');
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    this.current = this.load();
  }

  private load(): Config {
    let raw: unknown = {};
    if (existsSync(this.file)) {
      try {
        raw = JSON.parse(readFileSync(this.file, 'utf8'));
      } catch (err) {
        throw new Error(`${this.file} is not valid JSON: ${(err as Error).message}`);
      }
    }
    const parsed = ConfigSchema.safeParse(raw);
    if (!parsed.success) throw new Error(`${this.file} is invalid: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
    const cfg = parsed.data;
    // Alpaca's own environment variable names, so a .env or shell export works without the UI.
    const keyId = process.env.APCA_API_KEY_ID?.trim();
    const secret = process.env.APCA_API_SECRET_KEY?.trim();
    if (keyId && secret) {
      const mode = process.env.ALPACA_MODE === 'live' ? 'live' : (process.env.APCA_API_BASE_URL ?? '').includes('paper') || !process.env.APCA_API_BASE_URL ? 'paper' : 'live';
      cfg.alpaca = { keyId, secretKey: secret, mode };
    }
    if (process.env.PORT && Number.isInteger(Number(process.env.PORT))) cfg.port = Number(process.env.PORT);
    return cfg;
  }

  get(): Config {
    return this.current;
  }

  /** Validate, write atomically with owner-only permissions, and swap in. */
  update(patch: Partial<Config>): Config {
    const next = ConfigSchema.parse({ ...this.current, ...patch });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
    try {
      chmodSync(tmp, 0o600);
    } catch {
      // Windows: ACLs, not modes. The data dir is the user's own profile folder.
    }
    renameSync(tmp, this.file);
    this.current = next;
    return next;
  }
}

export function validationMessage(err: unknown): string {
  if (err instanceof z.ZodError) return err.issues.map((i) => `${i.path.join('.') || 'value'}: ${i.message}`).join('; ');
  return (err as Error).message ?? String(err);
}
