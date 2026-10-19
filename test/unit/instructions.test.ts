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

describe('asking to keep a fact', () => {
  it('nudges remember for remember and memory fixes, not for rules', async () => {
    const { asksToKeepAFact } = await import('../../src/reply');
    for (const heard of ['remember my name is Jordan', 'please remember I like jazz', "that's wrong, update my memory", 'fix that memory']) expect(asksToKeepAFact(heard)).toBe(true);
    for (const heard of ['always remember to answer in one sentence', 'what do you remember', 'how are you']) expect(asksToKeepAFact(heard)).toBe(false);
  });
});

describe('who-was questions', () => {
  it('turn a shape into a look-up unless they asked to see it', async () => {
    const { asModel } = await import('../../src/reply');
    const shape = { id: '1', name: 'show_form', arguments: '{"beats":[]}' };
    expect(asModel(shape, 'who was Ada Lovelace?')).toMatchObject({ name: 'look_up', arguments: '{"topic":"Ada Lovelace"}' });
    expect(asModel(shape, 'show me what Ada Lovelace looked like').name).toBe('show_form');
    expect(asModel(shape, 'show me a heart').name).toBe('show_form');
  });
});

describe('forget asks', () => {
  it('are recognised', async () => {
    const { asksToForget } = await import('../../src/reply');
    for (const heard of ['forget that I like jazz', 'actually forget that', 'delete that memory']) expect(asksToForget(heard)).toBe(true);
    for (const heard of ['remember I like jazz', 'how are you']) expect(asksToForget(heard)).toBe(false);
  });
});
