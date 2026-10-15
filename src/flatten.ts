import type { ChatMessage } from './chat';

export type BrainMessage =
  | { readonly role: 'system' | 'user' | 'assistant'; readonly content: string }
  | { readonly role: 'user'; readonly content: ChatMessage['content'] };

const textOf = (content: ChatMessage['content']): string =>
  typeof content === 'string' ? content : content === null ? '' : content.map((part) => (part.type === 'text' ? part.text : '')).join(' ');

export const flattenForBrain = (messages: readonly ChatMessage[]): BrainMessage[] => {
  const names = new Map<string, string>();
  const out: BrainMessage[] = [];

  for (const message of messages) {
    if (message.role === 'assistant') {
      for (const call of message.tool_calls ?? []) names.set(call.id, call.function.name);

      const said = textOf(message.content).trim();
      const calls = (message.tool_calls ?? []).map((call) => `${call.function.name}(${call.function.arguments || '{}'})`);
      const content = [said, ...calls.map((call) => `[I called ${call}]`)].filter((part) => part !== '').join(' ');

      if (content !== '') out.push({ role: 'assistant', content });

      continue;
    }

    if (message.role === 'tool') {
      out.push({
        role: 'user',
        content: `[Result of ${names.get(message.tool_call_id) ?? 'the tool'}, not said by the person] ${message.content}`,
      });
      continue;
    }

    if (message.role === 'system') out.push({ role: 'system', content: textOf(message.content) });
    else out.push({ role: 'user', content: message.content });
  }

  return out;
};
