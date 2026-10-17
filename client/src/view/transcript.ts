import type { Html, HtmlBuilder } from 'foldkit/html';
import type { TranscriptLine } from '../../../shared/protocol';
import { Message } from '../message';
import type { Model } from '../model';

type H = HtmlBuilder<Message>;

const KIND_LABEL: Record<TranscriptLine['kind'], string> = { heard: 'you', said: 'hark', tool: 'tool', result: 'done', error: 'error' };

const KIND_CLASS: Record<TranscriptLine['kind'], string> = {
  heard: 'text-white',
  said: 'text-white/70',
  tool: 'font-mono text-[11.5px] text-ember/80',
  result: 'font-mono text-[11.5px] text-white/40',
  error: 'font-mono text-[11.5px] text-red-300',
};

const clock = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

const lineRow = (h: H, line: TranscriptLine): Html =>
  h.li(
    [h.Class('grid grid-cols-[3.2rem_1fr] gap-3 py-1.5'), h.DataAttribute('kind', line.kind)],
    [
      h.span([h.Class('pt-0.5 font-mono text-[10px] tracking-[0.08em] text-white/30 uppercase'), h.Title(clock(line.at))], [KIND_LABEL[line.kind]]),
      h.span([h.Class(`min-w-0 break-words text-[13.5px] leading-snug ${KIND_CLASS[line.kind]}`)], [line.text]),
    ],
  );

export const transcriptHandle = (h: H, model: Model): Html =>
  h.button(
    [
      h.Type('button'),
      h.Id('transcript-handle'),
      h.AriaLabel(model.overlay ? 'Hide what was said' : 'Show what was said'),
      h.AriaExpanded(model.overlay),
      h.Class('fixed bottom-[88px] left-1/2 z-30 flex h-6 w-24 -translate-x-1/2 touch-none items-center justify-center rounded-full'),
      h.OnClick(Message.ToggledOverlay({ open: !model.overlay })),
    ],
    [h.span([h.Class('h-1 w-10 rounded-full bg-white/25')], [])],
  );

export const transcriptOverlay = (h: H, model: Model): Html =>
  h.section(
    [
      h.Id('transcript'),
      h.AriaLabel('What was said and done'),
      h.AriaHidden(!model.overlay),
      h.DataAttribute('open', model.overlay ? 'true' : 'false'),
      h.Class(
        `fixed inset-x-0 bottom-0 z-[60] mx-auto flex max-h-[62vh] w-[min(100vw,720px)] touch-pan-y flex-col rounded-t-3xl border border-b-0 border-white/[0.08] bg-[#0b0b0b]/92 shadow-2xl backdrop-blur-md transition-transform duration-300 ${model.overlay ? 'translate-y-0' : 'pointer-events-none translate-y-full'}`,
      ),
    ],
    [
      h.button([h.Type('button'), h.AriaLabel('Hide'), h.Class('mx-auto mt-2.5 mb-1 h-1 w-10 flex-none rounded-full bg-white/25'), h.OnClick(Message.ToggledOverlay({ open: false }))], []),
      h.p([h.Class('px-5 pb-2 font-mono text-[10.5px] tracking-[0.12em] text-white/35 uppercase')], ['What was said and done · swipe down to hide']),
      model.lines.length === 0
        ? h.p([h.Class('px-5 pb-8 text-[13px] text-white/40')], ['Nothing yet. Talk to hark and each line, tool and error shows up here.'])
        : h.ol([h.Class('min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-8'), h.Id('transcript-lines')], model.lines.map((line) => lineRow(h, line))),
    ],
  );
