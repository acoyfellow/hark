import { FORM_KINDS } from '../shared/protocol';

export type ToolCallShape = { readonly name: string; readonly args: Record<string, unknown> };

const FORM_TOOL = 'show_form';

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

export const shapeToolCall = (name: string, args: Record<string, unknown>, knownTools: readonly string[]): ToolCallShape => {
  if (knownTools.includes(name)) return { name, args: withParsedBeats(args) };

  if (isFormKind(name)) {
    const beats = parsedIfJson(args.beats);

    return { name: FORM_TOOL, args: { ...args, beats: Array.isArray(beats) ? beats : [{ kind: name, ...args }] } };
  }

  return { name, args };
};
