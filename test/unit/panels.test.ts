import { describe, expect, it } from 'vitest';
import type { Visual } from '../../shared/protocol';
import { added, changed, findPanel, MAX_OPEN_PANELS } from '../../src/panels';

const memory = (id: string, text: string): Visual => ({ _tag: 'Memory', id, text, forgotten: false });

const stack = (count: number) => Array.from({ length: count }, (_, index) => memory(`m${index + 1}`, `fact number ${index + 1}`)).reduce((panels, visual, index) => added(panels, visual, index), [] as ReturnType<typeof added>);

describe('panels', () => {
  it('keeps history but only a few open', () => {
    const panels = stack(6);
    expect(panels.length).toBe(6);
    expect(panels.filter((panel) => panel.open).length).toBe(MAX_OPEN_PANELS);
    expect(panels[0]?.open).toBe(false);
  });

  it('finds by number, words and last', () => {
    const panels = stack(3);
    expect(findPanel(panels, '2')?.id).toBe('m2');
    expect(findPanel(panels, 'the fact number 3')?.id).toBe('m3');
    expect(findPanel(panels, 'last')?.id).toBe('m3');
  });

  it('reopens, deletes, pins and resizes', () => {
    let panels = stack(6);
    panels = changed(panels, { action: 'open', which: '1' }).panels;
    expect(panels.find((panel) => panel.id === 'm1')?.open).toBe(true);
    panels = changed(panels, { action: 'delete', which: '4' }).panels;
    expect(panels.some((panel) => panel.id === 'm4')).toBe(false);
    panels = changed(panels, { action: 'resize', which: 'm2', size: 'large' }).panels;
    expect(panels.find((panel) => panel.id === 'm2')?.size).toBe('large');
    panels = changed(panels, { action: 'pin', which: 'm5' }).panels;
    panels = changed(panels, { action: 'delete_all' }).panels;
    expect(panels.map((panel) => panel.id)).toEqual(['m5']);
  });

  it('says what exists when nothing matches', () => {
    expect(changed(stack(2), { action: 'open', which: 'weather' }).note).toContain('No panel matches');
  });
});
