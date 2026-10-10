// Typed fetch helpers for the local service. Every error becomes an ApiError carrying the server's {error} message.
import type { Breach, Declaration, RuleSet } from '../src/engine/types.ts';
import {
  DEFAULT_PORT,
  type ActionLog,
  type DayPlan,
  type DeclareRequest,
  type EnforcementState,
  type ImportRequest,
  type ImportResponse,
  type ReportResponse,
  type SettingsUpdate,
  type SettingsView,
  type SetupCheckResponse,
  type StateResponse,
  type StrategyDefinition,
  type TradeDto,
} from '../src/server/api.ts';

export const SERVICE_ADDRESS = `127.0.0.1:${DEFAULT_PORT}`;
export const NOT_REACHABLE = `Service not reachable at ${SERVICE_ADDRESS}`;

export class ApiError extends Error {
  readonly status: number;
  /** True when the service itself could not be reached (no HTTP response, or the dev proxy failed). */
  readonly network: boolean;

  constructor(message: string, status: number, network: boolean) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.network = network;
  }
}

/** POST /api/settings/test. The account block is whatever the server attaches; only known keys are shown. */
export interface TestConnectionResponse {
  ok: boolean;
  detail: string;
  account?: Record<string, unknown>;
}

function errorMessage(data: unknown): string | null {
  if (data && typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'string') {
    return (data as { error: string }).error;
  }
  return null;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(NOT_REACHABLE, 0, true);
  }
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const msg = errorMessage(data);
    // A non-JSON 5xx is the dev proxy telling us the service is down, not a service error.
    if (msg === null && res.status >= 500) throw new ApiError(NOT_REACHABLE, res.status, true);
    throw new ApiError(msg ?? `Request failed (${res.status})`, res.status, false);
  }
  return data as T;
}

export const api = {
  getState: () => request<StateResponse>('GET', '/api/state'),
  getReport: () => request<ReportResponse>('GET', '/api/report'),
  importCsv: (body: ImportRequest) => request<ImportResponse>('POST', '/api/import', body),
  getRules: () => request<RuleSet>('GET', '/api/rules'),
  putRules: (rules: RuleSet) => request<RuleSet>('PUT', '/api/rules', rules),
  declare: (body: DeclareRequest) => request<Declaration>('POST', '/api/declare', body),
  cancelDeclaration: () => request<{ ok: boolean }>('DELETE', '/api/declare'),
  confirmPlan: (note?: string) => request<DayPlan>('POST', '/api/plan', note ? { note } : {}),
  setEnforcement: (body: { enabled?: boolean; dryRun?: boolean }) => request<EnforcementState>('POST', '/api/enforcement', body),
  kill: () => request<EnforcementState>('POST', '/api/kill', {}),
  flatten: (symbol?: string) => request<{ ok: boolean; detail: string }>('POST', '/api/flatten', symbol ? { symbol } : {}),
  getSettings: () => request<SettingsView>('GET', '/api/settings'),
  putSettings: (body: SettingsUpdate) => request<SettingsView>('PUT', '/api/settings', body),
  testSettings: () => request<TestConnectionResponse>('POST', '/api/settings/test', {}),
  getStrategy: () => request<StrategyDefinition>('GET', '/api/strategy'),
  putStrategy: (body: StrategyDefinition) => request<StrategyDefinition>('PUT', '/api/strategy', body),
  setupCheck: (symbol: string, side: 'long' | 'short') => request<SetupCheckResponse>('POST', '/api/setup-check', { symbol, side }),
  getActions: (limit = 200) => request<ActionLog[]>('GET', `/api/actions?limit=${limit}`),
  getBreaches: (days = 30) => request<(Breach & { id: number })[]>('GET', `/api/breaches?days=${days}`),
  getTrades: (days = 90) => request<TradeDto[]>('GET', `/api/trades?days=${days}`),
};
