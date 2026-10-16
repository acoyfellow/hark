import { describe, expect, it } from 'vitest';
import { flattenForBrain } from '../../src/flatten';
import type { ChatMessage } from '../../src/chat';

describe('tool rounds sent to the brain as plain text (Workers AI gpt-oss rejects role:tool messages)', () => {
  it('turns tool calls and tool results into ordinary string messages', () => {
    const history: ChatMessage[] = [
      { role: 'system', content: 'You are hark.' },
      { role: 'user', content: "What's the weather in Lisbon?" },
      { role: 'assistant', content: 'Let me check.', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'get_weather', arguments: '{"place":"Lisbon"}' } }] },
      { role: 'tool', tool_call_id: 'c1', content: '{"now_celsius":21}' },
    ];

    const flat = flattenForBrain(history);

    expect(flat).toEqual([
      { role: 'system', content: 'You are hark.' },
      { role: 'user', content: "What's the weather in Lisbon?" },
      { role: 'assistant', content: 'Let me check. (I used get_weather.)' },
      { role: 'user', content: '[Result of get_weather, not said by the person] {"now_celsius":21}' },
    ]);
    expect(flat.every((message) => typeof message.content === 'string')).toBe(true);
    expect(flat.some((message) => (message.role as string) === 'tool')).toBe(false);
  });

  it('keeps a camera frame as image content and drops empty assistant turns', () => {
    const flat = flattenForBrain([
      { role: 'assistant', content: null, tool_calls: [{ id: 'l', type: 'function', function: { name: 'look', arguments: '' } }] },
      { role: 'tool', tool_call_id: 'l', content: 'The camera shows a mug.' },
    ]);

    expect(flat).toEqual([
      { role: 'assistant', content: '(I used look.)' },
      { role: 'user', content: '[Result of look, not said by the person] The camera shows a mug.' },
    ]);
  });
});
