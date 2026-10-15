import type { ToolCall } from './sse';
import { TOOLS } from './tools';

const JSON_START = /^\s*[[{]/u;

const TOOL_NAMES = TOOLS.map((tool) => tool.name).join('|');

const MARKUP_START = new RegExp(`<\\s*(${TOOL_NAMES})\\b|(?:^|\\s)(${TOOL_NAMES})\\s*:\\s*(?=[{[])`, 'u');

export const mightBeLeakedCall = (text: string) => JSON_START.test(text);

export const markupStart = (text: string) => text.search(MARKUP_START);

const NAME_PREFIXES = new Set(TOOLS.flatMap((tool) => Array.from({ length: tool.name.length }, (_, end) => tool.name.slice(0, end + 1))));

const TRAILING_WORD = /(?:<\s*([a-z_]*)|(?:^|\s)([a-z_]+)(\s*:\s*)?)$/iu;

export const mightStartWrittenCall = (text: string): RegExpExecArray | null => {
  const match = TRAILING_WORD.exec(text);

  if (match === null) return null;

  const word = (match[1] ?? match[2] ?? '').toLowerCase();

  if (match[1] !== undefined) return match;

  return NAME_PREFIXES.has(word) ? match : null;
};

const quoteBareKeys = (text: string) => text.replace(/([{,]\s*)([a-z_]+)\s*:/giu, '$1"$2":');

export const balancedJson = (text: string): string | null => {
  const start = text.search(/[[{]/u);

  if (start === -1) return null;

  let depth = 0;
  let quoted = false;
  let escaped = false;

  for (let at = start; at < text.length; at += 1) {
    const char = text[at];

    if (escaped) escaped = false;
    else if (char === '\\') escaped = quoted;
    else if (char === '"') quoted = !quoted;
    else if (!quoted && (char === '{' || char === '[')) depth += 1;
    else if (!quoted && (char === '}' || char === ']')) {
      depth -= 1;

      if (depth === 0) return text.slice(start, at + 1);
    }
  }

  return null;
};

const looseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return JSON.parse(quoteBareKeys(text));
  }
};

const MARKUP_ATTRIBUTE = /([a-z_]+)\s*=\s*("(?:[^"\\]|\\.)*"|\[[\s\S]*\]|\{[\s\S]*\}|[^\s/>]+)/giu;

const attributeValue = (raw: string): unknown => {
  if (raw.startsWith('[') || raw.startsWith('{')) return looseJson(raw);

  if (raw.startsWith('"')) return JSON.parse(raw);

  return raw;
};

export const markupRemainder = (markup: string): string | null => {
  const closing = /\/>|<\/[a-z_]+>/iu.exec(markup);

  if (markup.trimStart().startsWith('<')) return closing === null ? null : markup.slice(closing.index + closing[0].length);

  const json = balancedJson(markup);

  return json === null ? null : markup.slice(markup.indexOf(json) + json.length);
};

export const markupCalls = (text: string): ToolCall[] => {
  const match = MARKUP_START.exec(text);

  if (match === null) return [];

  const name = match[1] ?? match[2] ?? '';
  const rest = text.slice(match.index + match[0].length);

  if (match[2] !== undefined) {
    try {
      const parsed = looseJson(balancedJson(rest) ?? '');

      return [{ id: 'leaked_colon', name, arguments: JSON.stringify(Array.isArray(parsed) ? { beats: parsed } : parsed) }];
    } catch {
      return [];
    }
  }

  const body = rest.replace(/\/?>[\s\S]*$/u, '');
  const args: Record<string, unknown> = {};

  try {
    for (const [, key, raw] of body.matchAll(MARKUP_ATTRIBUTE)) if (key !== undefined && raw !== undefined) args[key] = attributeValue(raw);
  } catch {
    return [];
  }

  return [{ id: 'leaked_markup', name, arguments: JSON.stringify(args) }];
};

const argumentSets = (parsed: unknown): Record<string, unknown>[] =>
  (Array.isArray(parsed) ? parsed : [parsed]).filter(
    (item): item is Record<string, unknown> => typeof item === 'object' && item !== null && !Array.isArray(item),
  );

const requiredOf = (parameters: Record<string, unknown>) =>
  Array.isArray(parameters.required) ? parameters.required.filter((key): key is string => typeof key === 'string') : [];

const propertiesOf = (parameters: Record<string, unknown>) =>
  typeof parameters.properties === 'object' && parameters.properties !== null ? Object.keys(parameters.properties) : [];

const toolFor = (args: Record<string, unknown>) => {
  const keys = Object.keys(args);

  return TOOLS.find((tool) => {
    const required = requiredOf(tool.parameters);
    const known = propertiesOf(tool.parameters);

    return required.length > 0 && required.every((key) => keys.includes(key)) && keys.every((key) => known.includes(key));
  });
};

const isBeatShaped = (args: Record<string, unknown>) => typeof args.kind === 'string' && typeof args.value === 'string';

export const leakedCalls = (text: string): ToolCall[] | null => {
  if (!mightBeLeakedCall(text)) return null;

  let parsed: unknown;

  try {
    parsed = looseJson(text.trim());
  } catch {
    return [];
  }

  const sets = argumentSets(parsed);

  if (sets.length > 0 && sets.every(isBeatShaped)) return [{ id: 'leaked_beats', name: 'show_form', arguments: JSON.stringify({ beats: sets }) }];

  return sets.flatMap((args, index) => {
    const tool = toolFor(args);

    return tool === undefined ? [] : [{ id: `leaked_${index}`, name: tool.name, arguments: JSON.stringify(args) }];
  });
};
