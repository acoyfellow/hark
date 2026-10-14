import type { Html, HtmlBuilder } from 'foldkit/html';
import type { Visual, WeatherDay } from '../../../shared/protocol';
import { Message } from '../message';
import type { Model } from '../model';
import { type IconName, icon } from './icons';

type H = HtmlBuilder<Message>;

const fahrenheit = () => /^en-US|^en-LR|^my/u.test(navigator.language);

const degrees = (celsius: number) =>
  Number.isFinite(celsius) ? `${Math.round(fahrenheit() ? celsius * 1.8 + 32 : celsius)}°` : '–';

export const weatherIcon = (code: number): IconName =>
  code <= 1
    ? 'sun'
    : code <= 2
      ? 'partly'
      : code <= 3
        ? 'cloud'
        : code <= 48
          ? 'fog'
          : code <= 67 || (code >= 80 && code <= 82)
            ? 'rain'
            : code <= 77 || code <= 86
              ? 'snow'
              : 'storm';

const weekday = (iso: string) => {
  const date = new Date(`${iso}T12:00:00`);

  return Number.isNaN(date.getTime())
    ? iso
    : new Intl.DateTimeFormat(navigator.language, { weekday: 'short' }).format(date);
};

const CARD =
  'visual pointer-events-auto relative w-full overflow-hidden rounded-3xl border border-white/10 bg-zinc-900/70 text-left shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)] backdrop-blur-xl';

const dismiss = (h: H, id: string): Html =>
  h.button(
    [
      h.Type('button'),
      h.AriaLabel('Dismiss'),
      h.Class(
        'absolute top-2.5 right-2.5 z-10 grid size-7 place-items-center rounded-full bg-black/40 text-white/60 opacity-0 transition group-hover:opacity-100 hover:text-white focus-visible:opacity-100',
      ),
      h.OnClick(Message.DismissedVisual({ id })),
    ],
    [icon(h, 'close', 'size-3.5')],
  );

const kicker = (h: H, name: IconName, label: string): Html =>
  h.p(
    [h.Class('flex items-center gap-1.5 font-mono text-[10.5px] tracking-[0.14em] text-ember uppercase')],
    [icon(h, name, 'size-3.5'), label],
  );

const day = (h: H, entry: WeatherDay): Html =>
  h.li(
    [h.Class('flex flex-col items-center gap-1 rounded-2xl bg-white/[0.04] px-2 py-2.5')],
    [
      h.span([h.Class('text-[11px] text-white/50')], [weekday(entry.day)]),
      h.span([h.Class('text-white/80')], [icon(h, weatherIcon(entry.code), 'size-4')]),
      h.span([h.Class('text-[12px] tabular-nums')], [degrees(entry.high), h.span([h.Class('text-white/40')], [` ${degrees(entry.low)}`])]),
    ],
  );

const pad = (value: number) => String(value).padStart(2, '0');

const countdown = (endsAt: number, now: number) => {
  const left = Math.max(0, Math.round((endsAt - now) / 1000));
  const hours = Math.floor(left / 3600);
  const minutes = Math.floor((left % 3600) / 60);
  const seconds = left % 60;

  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
};

const card = (h: H, model: Model, visual: Visual): Html => {
  switch (visual._tag) {
    case 'Weather':
      return h.article(
        [h.Class(`${CARD} group p-5`), h.DataAttribute('visual', 'weather')],
        [
          dismiss(h, visual.id),
          kicker(h, 'wind', 'Weather'),
          h.div(
            [h.Class('mt-3 flex items-center justify-between gap-4')],
            [
              h.div(
                [],
                [
                  h.p([h.Class('text-[44px] leading-none font-light tracking-tight tabular-nums')], [degrees(visual.now)]),
                  h.p([h.Class('mt-2 text-[13px] text-white/60')], [visual.place]),
                ],
              ),
              h.span([h.Class('text-amber')], [icon(h, weatherIcon(visual.code), 'size-14')]),
            ],
          ),
          h.ul([h.Class('mt-4 grid grid-cols-4 gap-1.5')], visual.days.map((entry) => day(h, entry))),
        ],
      );
    case 'Article':
      return h.article(
        [h.Class(`${CARD} group`), h.DataAttribute('visual', 'article')],
        [
          dismiss(h, visual.id),
          ...(visual.image === null
            ? []
            : [h.img([h.Src(visual.image), h.Alt(''), h.Class('h-36 w-full object-cover opacity-90'), h.Loading('lazy')])]),
          h.div(
            [h.Class('p-5')],
            [
              kicker(h, 'brain', 'Looked up'),
              h.h3([h.Class('mt-2 text-[17px] font-medium tracking-tight')], [visual.title]),
              h.p([h.Class('mt-1.5 line-clamp-3 text-[13px] leading-relaxed text-white/60')], [visual.summary]),
              h.a(
                [h.Href(visual.url), h.Target('_blank'), h.Rel('noreferrer'), h.Class('mt-3 inline-flex items-center gap-1 text-[12px] text-white/50 hover:text-white')],
                ['Wikipedia', icon(h, 'external', 'size-3')],
              ),
            ],
          ),
        ],
      );
    case 'Image':
      return h.article(
        [h.Class(`${CARD} group`), h.DataAttribute('visual', 'image')],
        [
          dismiss(h, visual.id),
          h.img([h.Src(visual.src), h.Alt(visual.prompt), h.Class('aspect-square w-full object-cover')]),
          h.div(
            [h.Class('flex items-center gap-3 p-4')],
            [
              h.p([h.Class('line-clamp-2 flex-1 text-[12px] leading-snug text-white/55')], [visual.prompt]),
              h.a(
                [h.Href(visual.src), h.Download('hark.jpg'), h.AriaLabel('Download'), h.Class('grid size-8 place-items-center rounded-full bg-white/[0.06] text-white/70 hover:text-white')],
                [icon(h, 'download', 'size-4')],
              ),
            ],
          ),
        ],
      );
    case 'Timer': {
      const done = visual.endsAt <= model.now;

      return h.article(
        [h.Class(`${CARD} group p-5 ${done ? 'timer-done' : ''}`), h.DataAttribute('visual', 'timer')],
        [
          dismiss(h, visual.id),
          kicker(h, 'timer', done ? 'Done' : 'Timer'),
          h.p([h.Class('mt-2 font-mono text-[40px] leading-none tracking-tight tabular-nums')], [countdown(visual.endsAt, model.now)]),
          h.p([h.Class('mt-2 text-[13px] text-white/60 capitalize')], [visual.label]),
        ],
      );
    }
    case 'Memory':
      return h.article(
        [h.Class(`${CARD} group p-4`), h.DataAttribute('visual', 'memory')],
        [
          dismiss(h, visual.id),
          kicker(h, 'memory', visual.forgotten ? 'Forgot' : 'Remembered'),
          h.p([h.Class(`mt-2 text-[14px] leading-snug ${visual.forgotten ? 'text-white/40 line-through' : 'text-white/85'}`)], [visual.text]),
        ],
      );
    case 'Glimpse':
      return h.article(
        [h.Class(`${CARD} group`), h.DataAttribute('visual', 'glimpse')],
        [
          dismiss(h, visual.id),
          h.img([h.Src(visual.src), h.Alt('What hark saw'), h.Class('aspect-video w-full object-cover')]),
          h.div([h.Class('p-3.5')], [kicker(h, 'eye', 'Saw this')]),
        ],
      );
  }
};

export const visuals = (h: H, model: Model): Html =>
  h.section(
    [
      h.AriaLabel('What hark showed you'),
      h.AriaLive('polite'),
      h.Class(
        'pointer-events-none flex w-full flex-col gap-3 md:absolute md:top-6 md:right-6 md:bottom-28 md:w-[340px] md:justify-end',
      ),
    ],
    model.visuals.map((visual) => h.keyed('div')(visual.id, [h.Class('visual-in')], [card(h, model, visual)])),
  );
