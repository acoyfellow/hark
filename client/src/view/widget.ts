import type { Html, HtmlBuilder } from 'foldkit/html';
import type { Widget } from '../../../shared/protocol';
import type { Message } from '../message';

type H = HtmlBuilder<Message>;

const TONE_TEXT = { neutral: 'text-white/80', good: 'text-emerald-300', warn: 'text-amber-300', bad: 'text-red-300' } as const;

const TONE_EDGE = { neutral: '', good: 'widget-good', warn: 'widget-warn', bad: 'widget-bad' } as const;

const KIND_LABEL = {
  report: 'Report',
  alert: 'Alert',
  table: 'Table',
  chart: 'Chart',
  terminal: 'Terminal',
  browser: 'Browser',
  files: 'Files',
  sources: 'Sources',
} as const;

const stats = (h: H, widget: Widget): Html =>
  widget.stats.length === 0
    ? h.empty
    : h.div(
        [h.Class('mt-3 grid grid-cols-2 gap-2')],
        widget.stats.map((stat) =>
          h.div(
            [h.Class('rounded-xl bg-white/[0.04] px-3 py-2')],
            [h.p([h.Class('text-[11px] text-white/45')], [stat.label]), h.p([h.Class(`font-mono text-[18px] tabular-nums ${TONE_TEXT[stat.tone]}`)], [stat.value])],
          ),
        ),
      );

const table = (h: H, widget: Widget): Html =>
  widget.rows.length === 0
    ? h.empty
    : h.div(
        [h.Class('mt-3 max-h-56 overflow-auto rounded-xl bg-black/20')],
        [
          h.table(
            [h.Class('w-full text-left text-[12px]')],
            [
              ...(widget.columns.length === 0 ? [] : [h.thead([], [h.tr([], widget.columns.map((column) => h.th([h.Class('px-3 py-2 font-medium text-white/50')], [column])))])]),
              h.tbody([], widget.rows.map((row) => h.tr([h.Class('border-t border-white/5')], row.map((cell) => h.td([h.Class('px-3 py-1.5 text-white/80')], [cell]))))),
            ],
          ),
        ],
      );

const chart = (h: H, widget: Widget): Html => {
  if (widget.series.length === 0) return h.empty;

  const top = Math.max(...widget.series.map((point) => Math.abs(point.value)), 1e-9);

  return h.div(
    [h.Class('mt-3 flex h-32 items-end gap-1.5')],
    widget.series.map((point) =>
      h.div(
        [h.Class('flex flex-1 flex-col items-center gap-1')],
        [
          h.div([h.Class('w-full rounded-t-md bg-ember/70'), h.Style({ height: `${Math.max(3, (Math.abs(point.value) / top) * 100)}px` })], []),
          h.p([h.Class('w-full truncate text-center text-[10px] text-white/45')], [point.label]),
        ],
      ),
    ),
  );
};

const code = (h: H, widget: Widget): Html =>
  widget.code === ''
    ? h.empty
    : h.pre([h.Class('mt-3 max-h-64 overflow-auto rounded-xl bg-black/50 p-3 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap text-emerald-100/90')], [widget.code]);

const image = (h: H, widget: Widget): Html =>
  widget.image === null ? h.empty : h.img([h.Src(widget.image), h.Alt(widget.title), h.Class('mt-3 w-full rounded-xl border border-white/10')]);

const links = (h: H, widget: Widget): Html =>
  widget.links.length === 0
    ? h.empty
    : h.ul(
        [h.Class('mt-3 space-y-2')],
        widget.links.map((link) =>
          h.li(
            [],
            [
              h.a([h.Href(link.url), h.Target('_blank'), h.Rel('noreferrer'), h.Class('text-[13px] text-white/85 underline decoration-white/20 hover:decoration-white')], [link.title]),
              link.note === '' ? h.empty : h.p([h.Class('line-clamp-2 text-[12px] text-white/50')], [link.note]),
            ],
          ),
        ),
      );

export const widgetCard = (h: H, widget: Widget, frame: string, dismiss: Html): Html =>
  h.article(
    [h.Class(`${frame} group p-4 ${TONE_EDGE[widget.tone]}`), h.DataAttribute('visual', 'widget'), h.DataAttribute('widget', widget.kind)],
    [
      dismiss,
      h.p([h.Class(`font-mono text-[11px] tracking-[0.18em] uppercase ${widget.tone === 'neutral' ? 'text-ember' : TONE_TEXT[widget.tone]}`)], [KIND_LABEL[widget.kind]]),
      widget.title === '' ? h.empty : h.h3([h.Class('mt-1.5 text-[16px] font-medium tracking-tight')], [widget.title]),
      widget.body === '' ? h.empty : h.p([h.Class('mt-1.5 text-[13px] leading-relaxed whitespace-pre-wrap text-white/65')], [widget.body]),
      stats(h, widget),
      table(h, widget),
      chart(h, widget),
      code(h, widget),
      image(h, widget),
      links(h, widget),
    ],
  );
