import { Option } from 'effect';
import type { Document, Html, HtmlBuilder } from 'foldkit/html';
import { Message } from '../message';
import type { Look, Model } from '../model';
import { Preview } from '../orb';
import { Swarm } from '../swarm';
import { commandSheet } from './command';
import { workspacePanel } from './workspace';
import { icon } from './icons';
import { visuals } from './visuals';

type H = HtmlBuilder<Message>;

const LABELS: Record<Look, string> = {
  asleep: 'Tap to talk',
  waking: 'Waking up',
  listening: 'Listening',
  hearing: 'Go on',
  thinking: 'Thinking',
  speaking: 'Speaking',
};

const HINTS: Record<Look, string> = {
  asleep: 'or press space',
  waking: 'opening the line to your account',
  listening: 'just talk. tap to sleep',
  hearing: 'I hear you',
  thinking: 'tap to stop',
  speaking: 'talk over me any time',
};

const labelOf = (model: Model) =>
  model.look === 'thinking' ? Option.getOrElse(model.doing, () => LABELS.thinking) : LABELS[model.look];

const ROUND =
  'grid size-12 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-white/70 backdrop-blur transition hover:bg-white/[0.08] hover:text-white active:scale-95';

const header = (h: H, model: Model): Html =>
  h.header(
    [h.Class('relative z-20 flex items-center justify-between px-5 pt-[max(1.25rem,env(safe-area-inset-top))] md:px-8')],
    [
      h.a(
        [h.Href('/'), h.Class('flex items-center gap-2.5'), h.AriaLabel('hark')],
        [h.img([h.Src('/brand/hark-wordmark.svg'), h.Alt('hark'), h.Height('22'), h.Class('h-[22px] w-auto')])],
      ),
      h.div(
        [h.Class('flex items-center gap-2')],
        [
          ...Option.match(model.account, {
            onNone: () => [],
            onSome: (account) => [
              h.span(
                [h.Class('hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 font-mono text-[11px] text-white/55 sm:flex')],
                [h.i([h.Class('size-1.5 rounded-full bg-ember'), h.AriaHidden(true)], []), account],
              ),
            ],
          }),
          h.button(
            [h.Type('button'), h.Id('open-workspace'), h.AriaLabel('Your computer'), h.AriaExpanded(model.workspace.open), h.Class('grid size-10 place-items-center rounded-full text-white/60 transition hover:bg-white/[0.06] hover:text-white'), h.OnClick(Message.ClickedWorkspace())],
            [icon(h, 'terminal')],
          ),
          h.button(
            [h.Type('button'), h.Id('settings'), h.AriaLabel('Settings'), h.AriaExpanded(model.sheet), h.Class('grid size-10 place-items-center rounded-full text-white/60 transition hover:bg-white/[0.06] hover:text-white'), h.OnClick(Message.ClickedSheet())],
            [icon(h, 'sliders')],
          ),
        ],
      ),
    ],
  );

const latency = (h: H, model: Model): Html =>
  Option.match(model.latency, {
    onNone: () => h.span([h.Class('h-4')], []),
    onSome: (measured) =>
      h.p(
        [h.Id('latency'), h.Class('flex items-center gap-2 font-mono text-[11px] text-white/40'), h.Title(`model ${measured.model} ms · voice ${measured.speech} ms`)],
        [
          icon(h, 'bolt', 'size-3.5 text-ember'),
          h.span([], [`${measured.total} ms`]),
          h.span([h.Class('text-white/25')], [measured.eager ? 'answered early' : 'you stopped → it spoke']),
        ],
      ),
  });

const stage = (h: H, model: Model): Html =>
  h.main(
    [h.Class('relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-5 md:flex-row md:px-8')],
    [
      h.div(
        [h.Class('flex flex-col items-center')],
        [
          h.button(
            [
              h.Type('button'),
              h.Id('orb'),
              h.AriaLabel(model.awake ? (model.look === 'speaking' || model.look === 'thinking' ? 'Stop' : 'Sleep') : 'Wake hark'),
              h.DataAttribute('look', model.look),
              h.Class('orb group relative grid aspect-square w-[min(78vw,46vh,440px)] place-items-center rounded-full outline-none'),
              h.OnClick(Message.ClickedOrb()),
            ],
            [],
          ),
          h.div(
            [h.Class('mt-2 flex min-h-[64px] flex-col items-center gap-1.5 text-center'), h.AriaLive('polite')],
            [
              h.p([h.Id('presence'), h.Class(`presence text-[22px] font-light tracking-tight ${model.look === 'asleep' ? 'text-white/80' : 'text-white'}`)], [labelOf(model)]),
              h.p([h.Class('text-[13px] text-white/35')], [Option.getOrElse(model.note, () => HINTS[model.look])]),
            ],
          ),
        ],
      ),
      visuals(h, model),
    ],
  );

const preview = (h: H, model: Model): Html =>
  model.cameraLive
    ? h.div(
        [h.Class('preview-in absolute top-[max(5rem,calc(env(safe-area-inset-top)+4rem))] left-5 z-20 w-28 overflow-hidden rounded-2xl border border-white/15 shadow-2xl md:left-8 md:w-44')],
        [h.video([h.Muted(true), h.Autoplay(true), h.Playsinline(true), h.Class('aspect-[3/4] w-full object-cover md:aspect-video'), h.OnMount(Preview())], [])],
      )
    : h.empty;

const dock = (h: H, model: Model): Html =>
  h.footer(
    [h.Class('relative z-20 flex items-center justify-between gap-4 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:px-8')],
    [
      h.button(
        [h.Type('button'), h.Id('camera'), h.AriaLabel(model.camera ? 'Turn camera off' : 'Turn camera on'), h.AriaPressed(String(model.camera)), h.Class(`${ROUND} ${model.camera ? 'border-ember/40 text-ember' : ''}`), h.OnClick(Message.ClickedCamera())],
        [icon(h, model.camera ? 'camera' : 'cameraOff')],
      ),
      latency(h, model),
      model.awake
        ? h.button(
            [h.Type('button'), h.Id('sleep'), h.AriaLabel('Sleep'), h.Class(ROUND), h.OnClick(Message.PressedEscape())],
            [icon(h, 'stop', 'size-4')],
          )
        : h.span([h.Class('size-12')], []),
    ],
  );

const fault = (h: H, model: Model): Html =>
  Option.match(model.fault, {
    onNone: () => h.empty,
    onSome: (reason) =>
      h.div(
        [h.Role('alert'), h.Id('fault'), h.Class('fault-in absolute top-[max(4.5rem,calc(env(safe-area-inset-top)+3.5rem))] inset-x-0 mx-auto z-40 flex w-[min(92vw,520px)] items-start gap-3 rounded-2xl border border-red-400/25 bg-red-950/70 px-4 py-3 text-[13px] text-red-100 backdrop-blur-xl')],
        [
          h.p([h.Class('flex-1 leading-relaxed')], [reason]),
          h.button([h.Type('button'), h.AriaLabel('Dismiss'), h.Class('text-red-200/60 hover:text-white'), h.OnClick(Message.DismissedFault())], [icon(h, 'close', 'size-4')]),
        ],
      ),
  });

const latestOf = <T extends Model['visuals'][number]['_tag']>(model: Model, tag: T) =>
  model.visuals.toReversed().find((visual): visual is Extract<Model['visuals'][number], { _tag: T }> => visual._tag === tag);

const swarm = (h: H, model: Model): Html => {
  const form = latestOf(model, 'Form');
  const painting = latestOf(model, 'Image');

  return h.div(
    [
      h.Id('swarm'),
      h.Class('swarm absolute inset-0 z-0'),
      h.AriaHidden(true),
      h.DataAttribute('look', model.look),
      h.DataAttribute('form-id', form?.id ?? ''),
      h.DataAttribute('form-beats', JSON.stringify(form?.beats ?? [])),
      h.DataAttribute('idle-beats', JSON.stringify(model.idle)),
      h.DataAttribute('paint-id', painting?.id ?? ''),
      h.DataAttribute('paint-src', painting?.src ?? ''),
      h.OnMount(Swarm()),
    ],
    [],
  );
};

const toast = (h: H, model: Model): Html =>
  Option.match(model.doing, {
    onNone: () => h.empty,
    onSome: (label) =>
      h.keyed('div')(
        label,
        [h.Id('toast'), h.Class('toast pointer-events-none absolute top-[max(4.75rem,calc(env(safe-area-inset-top)+3.75rem))] right-5 z-30 flex w-[min(330px,calc(100vw-2.5rem))] items-center gap-3.5 md:right-8'), h.Role('status')],
        [
          h.span([h.Class('medal grid size-10 flex-none place-items-center rounded-[11px]'), h.AriaHidden(true)], [icon(h, 'bolt', 'size-[18px]')]),
          h.span(
            [h.Class('min-w-0')],
            [
              h.small([h.Class('block font-mono text-[10px] tracking-[0.14em] text-[var(--e5)]/55 uppercase')], ['On it']),
              h.strong([h.Class('block truncate text-[14px] font-medium')], [label]),
            ],
          ),
          h.i([h.Class('toast-bar'), h.AriaHidden(true)], []),
        ],
      ),
  });

export const view = (model: Model, h: H): Document => ({
  title: model.look === 'asleep' ? 'hark' : `hark · ${LABELS[model.look].toLowerCase()}`,
  body: h.div(
    [h.Class(`app look-${model.look} relative flex h-dvh flex-col overflow-hidden`)],
    [swarm(h, model), header(h, model), toast(h, model), preview(h, model), fault(h, model), stage(h, model), dock(h, model), workspacePanel(h, model), commandSheet(h, model)],
  ),
});
