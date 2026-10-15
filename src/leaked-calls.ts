import type { ToolCall } from './sse';
import { TOOLS } from './tools';

const JSON_START = /^\s*[[{]/u;

export const mightBeLeakedCall = (text: string) => JSON_START.test(text);

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

export const leakedCalls = (text: string): ToolCall[] | null => {
  if (!mightBeLeakedCall(text)) return null;

  let parsed: unknown;

  try {
    parsed = JSON.parse(text.trim());
  } catch {
    return [];
  }

  return argumentSets(parsed).flatMap((args, index) => {
    const tool = toolFor(args);

    return tool === undefined ? [] : [{ id: `leaked_${index}`, name: tool.name, arguments: JSON.stringify(args) }];
  });
};
