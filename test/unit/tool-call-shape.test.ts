import { describe, expect, it } from 'vitest';
import { shapeToolCall } from '../../src/tool-call-shape';

const KNOWN = ['show_form', 'cloudflare', 'terminal'];

const PHONELLM_ROCKET = {
  beats: '[{"kind": "model", "value": [{"shape": "cone", "at": [0, 0.8, 0], "size": [0.2, 0.2, 0.2]}]}]',
};

describe('small voice models that call a beat kind as if it were a tool', () => {
  it('routes a call named model to show_form and parses its beats string', () => {
    const shaped = shapeToolCall('model', PHONELLM_ROCKET, KNOWN);

    expect(shaped.name).toBe('show_form');
    expect(shaped.args.beats).toEqual([{ kind: 'model', value: [{ shape: 'cone', at: [0, 0.8, 0], size: [0.2, 0.2, 0.2] }] }]);
  });

  it('wraps a bare beat called by its kind into one beat', () => {
    const shaped = shapeToolCall('emoji', { value: '🚀' }, KNOWN);

    expect(shaped).toEqual({ name: 'show_form', args: { value: '🚀', beats: [{ kind: 'emoji', value: '🚀' }] } });
  });

  it('parses a beats string on a real show_form call', () => {
    expect(shapeToolCall('show_form', { beats: '[{"kind":"word","value":"hi"}]' }, KNOWN).args.beats).toEqual([{ kind: 'word', value: 'hi' }]);
  });

  it('leaves known tools and unknown names alone', () => {
    expect(shapeToolCall('cloudflare', { path: '/zones' }, KNOWN)).toEqual({ name: 'cloudflare', args: { path: '/zones' } });
    expect(shapeToolCall('teleport', { to: 'mars' }, KNOWN)).toEqual({ name: 'teleport', args: { to: 'mars' } });
  });
});
