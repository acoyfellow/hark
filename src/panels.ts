import type { Panel, PanelSize, Visual } from '../shared/protocol';

export const MAX_PANELS = 40;

export const MAX_OPEN_PANELS = 4;

export const titleOf = (visual: Visual): string => {
  switch (visual._tag) {
    case 'Article':
      return visual.title;
    case 'Image':
      return visual.prompt.slice(0, 60);
    case 'Timer':
      return `Timer: ${visual.label}`;
    case 'Memory':
      return visual.text.slice(0, 60);
    case 'Glimpse':
      return 'What hark saw';
    case 'Widget':
      return visual.widget.title;
    case 'Form':
      return 'Shape';
  }
};

export const kindOf = (visual: Visual): string => (visual._tag === 'Widget' ? visual.widget.kind : visual._tag.toLowerCase());

export const keepsAPanel = (visual: Visual) => visual._tag !== 'Form';

const limitOpen = (opened: readonly Panel[], keep: string): Panel[] => {
  const openOnes = opened.filter((panel) => panel.open && !panel.pinned && panel.id !== keep).toSorted((left, right) => left.at - right.at);
  const tooMany = opened.filter((panel) => panel.open).length - MAX_OPEN_PANELS;
  const closing = new Set(tooMany > 0 ? openOnes.slice(0, tooMany).map((panel) => panel.id) : []);
  return opened.map((panel) => (closing.has(panel.id) ? { ...panel, open: false } : panel));
};

const reopened = (panels: readonly Panel[], id: string, at: number): Panel[] =>
  limitOpen(panels.map((panel) => (panel.id === id ? { ...panel, open: true, at } : panel)), id);

export const added = (panels: readonly Panel[], visual: Visual, at: number): Panel[] => {
  const fresh: Panel = { id: visual.id, title: titleOf(visual), kind: kindOf(visual), at, open: true, pinned: false, size: 'medium', visual };
  const rest = panels.filter((panel) => panel.id !== visual.id);
  const opened = [...rest, fresh];
  const kept = limitOpen(opened, fresh.id);
  const overflow = kept.length - MAX_PANELS;
  return overflow > 0 ? kept.filter((panel, index) => panel.pinned || index >= overflow) : kept;
};

const STOP = new Set(['the', 'a', 'an', 'that', 'this', 'one', 'panel', 'card', 'my', 'it', 'again']);

const words = (text: string) => text.toLowerCase().split(/[^a-z0-9]+/u).filter((word) => word.length > 1 && !STOP.has(word));

export const findPanel = (panels: readonly Panel[], which: string): Panel | undefined => {
  const newestFirst = panels.toReversed();
  const trimmed = which.trim().toLowerCase();
  if (trimmed === '' || trimmed === 'last' || trimmed === 'latest' || trimmed === 'newest') return newestFirst[0];
  const exact = panels.find((panel) => panel.id === which);
  if (exact !== undefined) return exact;
  const spoken = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'].indexOf(trimmed.replace(/^number\s+/u, '')) + 1;
  if (spoken > 0) return panels[spoken - 1];
  const numbered = /^(?:#|number\s*)?(\d+)$/u.exec(trimmed);
  if (numbered !== null) return panels[Number(numbered[1]) - 1];
  const wanted = words(trimmed);
  const scored = newestFirst.map((panel) => ({ panel, score: wanted.filter((word) => `${panel.title} ${panel.kind}`.toLowerCase().includes(word)).length }));
  const best = scored.toSorted((left, right) => right.score - left.score)[0];
  return best !== undefined && best.score > 0 ? best.panel : undefined;
};

export const listed = (panels: readonly Panel[]) =>
  panels.length === 0 ? 'No panels yet.' : panels.map((panel, index) => `${index + 1}. ${panel.title} (${panel.kind}${panel.open ? ', open' : ''}${panel.pinned ? ', pinned' : ''}${panel.size === 'medium' ? '' : `, ${panel.size}`})`).join('\n');

export type PanelChange =
  | { readonly action: 'open' | 'close' | 'delete' | 'pin' | 'unpin'; readonly which: string }
  | { readonly action: 'resize'; readonly which: string; readonly size: PanelSize }
  | { readonly action: 'close_all' | 'delete_all' };

export const changed = (panels: readonly Panel[], change: PanelChange): { readonly panels: Panel[]; readonly note: string } => {
  if (change.action === 'close_all') return { panels: panels.map((panel) => ({ ...panel, open: false })), note: 'Closed every panel. They are still in the drawer.' };
  if (change.action === 'delete_all') return { panels: panels.filter((panel) => panel.pinned), note: 'Deleted every panel that was not pinned.' };
  return 'which' in change ? changedOne(panels, change) : { panels: [...panels], note: 'Nothing changed.' };
};

const changedOne = (panels: readonly Panel[], change: Exclude<PanelChange, { readonly action: 'close_all' | 'delete_all' }>): { readonly panels: Panel[]; readonly note: string } => {
  const target = findPanel(panels, change.which);
  if (target === undefined) return { panels: [...panels], note: `No panel matches "${change.which}". Panels:\n${listed(panels)}` };
  const apply = (update: (panel: Panel) => Panel | null) => panels.flatMap((panel) => (panel.id === target.id ? [update(panel)].filter((each): each is Panel => each !== null) : [panel]));
  switch (change.action) {
    case 'open':
      return { panels: reopened(panels, target.id, Date.now()), note: `Opened "${target.title}".` };
    case 'close':
      return { panels: apply((panel) => ({ ...panel, open: false })), note: `Closed "${target.title}". It is still in the drawer.` };
    case 'delete':
      return { panels: apply(() => null), note: `Deleted "${target.title}".` };
    case 'pin':
      return { panels: limitOpen(apply((panel) => ({ ...panel, pinned: true, open: true })), target.id), note: `Pinned "${target.title}".` };
    case 'unpin':
      return { panels: apply((panel) => ({ ...panel, pinned: false })), note: `Unpinned "${target.title}".` };
    case 'resize':
      return { panels: limitOpen(apply((panel) => ({ ...panel, size: change.size, open: true })), target.id), note: `"${target.title}" is now ${change.size}.` };
  }
};
