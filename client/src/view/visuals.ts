import type { Html, HtmlBuilder } from 'foldkit/html';
import type { Visual } from '../../../shared/protocol';
import { Message } from '../message';
import type { Model } from '../model';
import { type IconName, icon } from './icons';
import { widgetCard } from './widget';

type H = HtmlBuilder<Message>;

const CARD =
  'visual glass pointer-events-auto relative w-full overflow-hidden rounded-3xl text-left';

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
    case 'Form':
      return h.empty;
    case 'Widget':
      return widgetCard(h, visual.widget, CARD, dismiss(h, visual.id));
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
        'pointer-events-none flex w-full flex-col gap-3 md:absolute md:top-20 md:right-6 md:bottom-28 md:w-[340px] md:justify-start md:overflow-visible',
      ),
    ],
    model.visuals
      .filter((visual) => visual._tag !== 'Form')
      .toReversed()
      .map((visual) => h.keyed('div')(visual.id, [h.Class(visual._tag === 'Image' ? 'visual-in painted-in' : 'visual-in')], [card(h, model, visual)])),
  );
