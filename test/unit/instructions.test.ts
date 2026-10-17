import { describe, expect, it } from 'vitest';
import { systemPrompt } from '../../src/prompt';

const base = { now: new Date('2026-10-16T12:00:00Z'), timeZone: 'UTC', locale: 'en-US', memories: [], camera: false, firstTurn: false };

describe('their own instructions', () => {
  it('are added after the built-in rules, which still win', () => {
    const prompt = systemPrompt({ ...base, instructions: '- Call me Captain.' });
    expect(prompt).toContain('Call me Captain.');
    expect(prompt.indexOf('Call me Captain.')).toBeGreaterThan(prompt.indexOf('capabilities'));
    expect(prompt).toContain('the rules above always win');
  });

  it('leave the prompt untouched when empty', () => {
    expect(systemPrompt({ ...base, instructions: '  ' })).toBe(systemPrompt(base));
  });
});

describe('a standing rule in what they said', () => {
  it('is caught for from-now-on, always, never, stop and call-me', async () => {
    const { setsARule } = await import('../../src/reply');
    for (const heard of ['from now on keep it short', 'always show a shape', 'never say sorry', 'stop calling me Captain', 'edit your system prompt']) expect(setsARule(heard)).toBe(true);
    for (const heard of ['what is the weather', 'paint a cat', 'how are you', 'call me Jordan']) expect(setsARule(heard)).toBe(false);
  });
});
