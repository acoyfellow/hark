import { describe, expect, it } from 'vitest';
import { decodeClientFrame } from '../../shared/protocol';

describe('picking a brain in settings reaches the Durable Object', () => {
  it('decodes the exact Configure frame the browser sent on prod', () => {
    const sent = '{"_tag":"Configure","settings":{"voice":"asteria","brain":"@cf/daily-co/phonellm-mini-alpha-2","engine":"aura-1"}}';

    expect(decodeClientFrame(sent)._tag).toBe('Some');
  });
});
