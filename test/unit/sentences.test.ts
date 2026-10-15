import { describe, expect, test } from 'vitest';
import { chunker, sameWords, speakable } from '../../src/sentences';

const feed = (text: string, step = 3) => {
  const chunks = chunker();
  const out: string[] = [];

  for (let at = 0; at < text.length; at += step) out.push(...chunks.push(text.slice(at, at + step)));

  return [...out, ...chunks.flush()];
};

describe('chunker', () => {
  test('cuts the first sentence early so the voice starts fast', () => {
    const out = feed('Sure thing. It is about twenty degrees in Lisbon today, with clear skies. Bring sunglasses!');

    expect(out[0]).toBe('Sure thing. It is about twenty degrees in Lisbon today,');
    expect(out.slice(1)).toEqual(['with clear skies. Bring sunglasses!']);
  });

  test('cuts a long first clause at a comma', () => {
    const out = feed('Well, the honest answer is that it depends on how you count, but roughly forty');

    expect(out[0]).toBe('Well, the honest answer is that it depends on how you count,');
  });

  test('never loses words', () => {
    const text = 'One. Two, three; four: five, six. Seven? Eight! Nine… ten.';

    expect(feed(text, 1).join(' ').replace(/\s+/g, ' ')).toBe(text);
  });

  test('hard-cuts runaway text without punctuation', () => {
    const out = feed('word '.repeat(120));

    expect(out.length).toBeGreaterThan(1);
    expect(Math.max(...out.map((piece) => piece.length))).toBeLessThanOrEqual(260);
  });
});

describe('speakable', () => {
  test('strips markdown, links, and code a voice cannot say', () => {
    expect(speakable('**Bold** and _soft_ [link](https://x.y) `code` https://example.com # Head')).toBe('Bold and soft link code Head');
    expect(speakable('- one\n- two\n1. three')).toBe('one two three');
  });

  test('never reads out tool calls a brain wrote as text', () => {
    expect(speakable('Let me draw that. <show_form beats=[{kind:"draw", value:"M10 10 L90 10"}]></show_form> Ta-da.')).toBe('Let me draw that. Ta-da.');
    expect(speakable('Here [{"kind":"emoji","value":"x"}] you go.')).toBe('Here you go.');
  });

  test('spells acronyms and turns written pauses into spoken ones', () => {
    expect(speakable('Your API keys and the AI Gateway stop DDoS attacks — fast.')).toBe('Your A P I keys and the A.I. Gateway stop D D O S attacks... fast.');
    expect(speakable('He said "hello" to the URLs.')).toBe("He said hello to the U R L's.");
  });
});

describe('sameWords', () => {
  test('ignores case and punctuation', () => {
    expect(sameWords("What's the weather?", 'whats the weather')).toBe(true);
    expect(sameWords('what is the weather', 'what is the weather in paris')).toBe(false);
  });
});
