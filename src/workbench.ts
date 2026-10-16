import { exports, WorkerEntrypoint } from 'cloudflare:workers';
import './worker-env';
import type { Env } from './env';

export const MAX_BRIDGE_CALLS = 40;

export const MAX_FILE_BYTES = 200_000;

export type BenchCall = { readonly name: string; readonly ok: boolean; readonly ms: number; readonly error?: string };

export type BenchResult =
  | { readonly ok: true; readonly result: unknown; readonly logs: readonly string[]; readonly calls: readonly BenchCall[] }
  | { readonly ok: false; readonly error: string; readonly logs: readonly string[]; readonly calls: readonly BenchCall[] };

type Outcome = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly error: string };

type BridgeProps = { readonly owner: string };

export const BENCH_CAPABILITIES = ['read_file', 'write_file', 'list_files', 'delete_file', 'imagine', 'mcp_connect', 'mcp_tools', 'mcp_call'] as const;

export type BenchCapability = (typeof BENCH_CAPABILITIES)[number];

const asJson = (value: unknown): unknown => (value === undefined ? null : JSON.parse(JSON.stringify(value)));

export class HarkBridge extends WorkerEntrypoint<Env, BridgeProps> {
  async call(name: string, input: unknown): Promise<Outcome> {
    try {
      const hark = await this.env.HARK.getByName(this.ctx.props.owner);

      return { ok: true, value: asJson(await hark.benchCall(name, input)) };
    } catch (cause) {
      return { ok: false, error: cause instanceof Error ? cause.message : String(cause) };
    }
  }
}

const benchModule = (code: string): string => `export default {
  async fetch(request, env) {
    const calls = [];
    const logs = [];
    const say = (...parts) => { if (logs.length < 200) logs.push(parts.map((part) => typeof part === 'string' ? part : JSON.stringify(part)).join(' ').slice(0, 2000)); };
    const console = Object.freeze({ log: say, info: say, warn: say, error: say });
    const call = async (name, input) => {
      if (calls.length >= ${MAX_BRIDGE_CALLS}) throw new Error("limited to ${MAX_BRIDGE_CALLS} calls");
      const started = Date.now();
      const outcome = await env.HARK.call(name, input ?? {});
      calls.push(outcome.ok ? { name, ok: true, ms: Date.now() - started } : { name, ok: false, ms: Date.now() - started, error: outcome.error });
      if (!outcome.ok) throw new Error(name + ": " + outcome.error);
      return outcome.value;
    };
    const hark = Object.freeze({
${BENCH_CAPABILITIES.map((name) => `      ${name}: (input) => call(${JSON.stringify(name)}, input),`).join('\n')}
    });
    try {
      const result = await (async () => {
${code}
      })();
      return Response.json({ ok: true, result: result ?? null, logs, calls });
    } catch (error) {
      return Response.json({ ok: false, error: String(error && error.message ? error.message : error), logs, calls });
    }
  }
};`;

const isBenchResult = (value: unknown): value is BenchResult =>
  typeof value === 'object' && value !== null && 'ok' in value && 'calls' in value && 'logs' in value;

export const runOnBench = async (env: Env, owner: string, code: string): Promise<BenchResult> => {
  const worker = env.LOADER.load({
    compatibilityDate: '2026-09-30',
    mainModule: 'bench.js',
    modules: { 'bench.js': benchModule(code) },
    globalOutbound: null,
    env: { HARK: exports.HarkBridge({ props: { owner } }) },
  });
  const response = await worker.getEntrypoint().fetch(new Request('https://bench.hark/'));
  const body: unknown = await response.json().catch(() => null);

  return isBenchResult(body) ? body : { ok: false, error: 'the program returned no result', logs: [], calls: [] };
};
