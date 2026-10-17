import { FORM_KINDS } from '../shared/protocol';

export type ToolCallShape = { readonly name: string; readonly args: Record<string, unknown> };

const FORM_TOOL = 'show_form';

const PANEL_TOOL = 'panels';

const PANEL_VERBS = ['list', 'open', 'close', 'delete', 'pin', 'unpin', 'resize', 'close_all', 'delete_all'];

const panelVerb = (name: string) => {
  const bare = name.replace(/^panels?[_.]/u, '').replace(/_panels?$/u, '');
  return PANEL_VERBS.includes(bare) ? bare : null;
};

const isFormKind = (name: string): boolean => (FORM_KINDS as readonly string[]).includes(name);

const parsedIfJson = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const withParsedBeats = (args: Record<string, unknown>): Record<string, unknown> =>
  'beats' in args ? { ...args, beats: parsedIfJson(args.beats) } : args;

const BROKEN_KEY = /^(\w+)=(.*)$/u;

const withFixedKeys = (args: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(args).map(([key, value]) => {
      const broken = BROKEN_KEY.exec(key);
      return broken !== null && (value === '' || value === null) ? [broken[1] ?? key, broken[2] ?? ''] : [key, value];
    }),
  );

export const shapeToolCall = (name: string, raw: Record<string, unknown>, knownTools: readonly string[]): ToolCallShape => {
  const args = withFixedKeys(raw);

  if (knownTools.includes(name)) return { name, args: withParsedBeats(args) };

  if (isFormKind(name)) {
    const beats = parsedIfJson(args.beats);

    return { name: FORM_TOOL, args: { ...args, beats: Array.isArray(beats) ? beats : [{ kind: name, ...args }] } };
  }

  const verb = panelVerb(name);

  if (verb !== null) return { name: PANEL_TOOL, args: { ...args, action: verb } };

  return { name, args };
};
