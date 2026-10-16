import { type Widget, WIDGET_KINDS, WIDGET_TONES } from './protocol';

type Raw = Record<string, unknown>;

const MAX_TEXT = 1200;

const MAX_CODE = 8000;

const MAX_ROWS = 40;

const MAX_ITEMS = 24;

const record = (value: unknown): Raw => (typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Raw) : {});

const items = (value: unknown): unknown[] => (Array.isArray(value) ? value.slice(0, MAX_ITEMS) : []);

const text = (value: unknown, cap = MAX_TEXT): string => (value === undefined || value === null ? '' : String(value).slice(0, cap));

const toneOf = (value: unknown): Widget['tone'] => WIDGET_TONES.find((tone) => tone === value) ?? 'neutral';

const kindOf = (value: unknown): Widget['kind'] => WIDGET_KINDS.find((kind) => kind === value) ?? 'report';

const safeUrl = (value: unknown): string | null => {
  try {
    const url = new URL(String(value));

    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
};

const safeImage = (value: unknown): string | null => {
  const raw = text(value, 4_000_000);

  return raw.startsWith('data:image/') ? raw : safeUrl(raw);
};

export const widgetOf = (id: string, raw: unknown): Widget => {
  const input = record(raw);
  const rows = Array.isArray(input.rows) ? input.rows.slice(0, MAX_ROWS) : [];

  return {
    id,
    kind: kindOf(input.kind),
    tone: toneOf(input.tone),
    title: text(input.title, 140),
    body: text(input.body),
    stats: items(input.stats).map((stat) => ({ label: text(record(stat).label, 60), value: text(record(stat).value, 40), tone: toneOf(record(stat).tone) })),
    columns: items(input.columns).map((column) => text(column, 60)),
    rows: rows.map((row) => items(row).map((cell) => text(cell, 200))),
    series: items(input.series).flatMap((point) => {
      const value = Number(record(point).value);

      return Number.isFinite(value) ? [{ label: text(record(point).label, 30), value }] : [];
    }),
    code: text(input.code, MAX_CODE),
    image: input.image === undefined || input.image === null ? null : safeImage(input.image),
    links: items(input.links).flatMap((link) => {
      const url = safeUrl(record(link).url);

      return url === null ? [] : [{ title: text(record(link).title, 140) || url, url, note: text(record(link).note, 300) }];
    }),
  };
};

export const isEmptyWidget = (widget: Widget) =>
  widget.title === '' && widget.body === '' && widget.stats.length === 0 && widget.rows.length === 0 && widget.series.length === 0 && widget.code === '' && widget.image === null && widget.links.length === 0;
