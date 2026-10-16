import { Option } from 'effect';
import type { Html, HtmlBuilder } from 'foldkit/html';
import { Message } from '../message';
import type { Model, WorkspaceEntry } from '../model';
import { WorkspaceTerminal } from '../workspace-terminal';
import { icon } from './icons';

type H = HtmlBuilder<Message>;

const depthOf = (path: string) => path.split('/').length - 1;

const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1);

const treeRow = (h: H, entry: WorkspaceEntry, selected: boolean): Html =>
  h.button(
    [
      h.Type('button'),
      h.DataAttribute('path', entry.path),
      h.Disabled(entry.type === 'dir'),
      h.Class(`flex w-full items-center gap-1.5 truncate rounded-md py-1 pr-2 text-left font-mono text-[12px] transition ${selected ? 'bg-ember/15 text-white' : entry.type === 'dir' ? 'text-white/45' : 'text-white/75 hover:bg-white/[0.05] hover:text-white'}`),
      h.Style({ paddingLeft: `${8 + depthOf(entry.path) * 12}px` }),
      ...(entry.type === 'file' ? [h.OnClick(Message.ClickedFile({ path: entry.path }))] : []),
    ],
    [h.span([h.Class('w-3 flex-none text-white/30')], [entry.type === 'dir' ? '▸' : '']), nameOf(entry.path)],
  );

const tree = (h: H, model: Model): Html => {
  const open = Option.map(model.workspace.file, (file) => file.path).pipe(Option.getOrElse(() => ''));

  return h.aside(
    [h.Class('own-scroll flex min-h-0 flex-col border-white/[0.07] max-md:max-h-40 max-md:border-b md:border-r'), h.AriaLabel('Files')],
    [
      h.div(
        [h.Class('flex items-center justify-between px-3 pt-3 pb-2')],
        [
          h.span([h.Class('font-mono text-[10.5px] tracking-[0.14em] text-white/40 uppercase')], ['/workspace']),
          h.button([h.Type('button'), h.AriaLabel('Refresh files'), h.Class('rounded px-1.5 text-[12px] text-white/45 hover:text-white'), h.OnClick(Message.ClickedRefreshTree())], [model.workspace.loading ? '…' : '↻']),
        ],
      ),
      h.div(
        [h.Id('workspace-tree'), h.Class('flex flex-col px-1.5 pb-3')],
        model.workspace.tree.length === 0
          ? [h.p([h.Class('px-2 text-[12px] text-white/40')], [model.workspace.loading ? 'Waking your computer…' : 'Empty. Ask hark to make something, or use the terminal.'])]
          : model.workspace.tree.map((entry) => treeRow(h, entry, entry.path === open)),
      ),
    ],
  );
};

const codeView = (h: H, model: Model): Html =>
  Option.match(model.workspace.file, {
    onNone: () => h.div([h.Class('grid min-h-0 place-items-center text-[13px] text-white/35')], ['Pick a file to read it here.']),
    onSome: (file) =>
      h.div(
        [h.Class('flex min-h-0 flex-col')],
        [
          h.div([h.Class('flex-none border-b border-white/[0.07] px-4 py-2 font-mono text-[12px] text-white/60')], [file.path]),
          h.pre([h.Id('workspace-code'), h.Class('own-scroll m-0 min-h-0 flex-1 px-4 py-3 font-mono text-[12.5px] leading-relaxed whitespace-pre text-[#ffe7c4]')], [file.text]),
        ],
      ),
  });

export const workspacePanel = (h: H, model: Model): Html =>
  model.workspace.open
    ? h.section(
        [
          h.Id('workspace'),
          h.Role('dialog'),
          h.AriaLabel('Your computer'),
          h.Class('fixed inset-2 z-40 flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0b0705]/95 shadow-[0_28px_80px_rgba(0,0,0,.55)] backdrop-blur-xl md:inset-6'),
        ],
        [
          h.header(
            [h.Class('flex flex-none items-center gap-3 border-b border-white/[0.07] px-4 py-2.5')],
            [
              h.span([h.Class('size-2 rounded-full bg-emerald-400')], []),
              h.h2([h.Class('m-0 text-[14px] font-medium')], ['Your computer']),
              h.span([h.Class('font-mono text-[11.5px] text-white/40 max-sm:hidden')], ['durable Linux · node, git, npm, wrangler']),
              h.button([h.Type('button'), h.AriaLabel('Close your computer'), h.Class('ml-auto grid size-8 place-items-center rounded-lg text-white/55 hover:bg-white/[0.06] hover:text-white'), h.OnClick(Message.ClosedWorkspace())], [icon(h, 'close', 'size-4')]),
            ],
          ),
          h.div(
            [h.Class('grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] md:grid-cols-[240px_minmax(0,1fr)] md:grid-rows-1')],
            [
              tree(h, model),
              h.div(
                [h.Class('grid min-h-0 grid-rows-[minmax(0,1fr)_minmax(0,1.1fr)]')],
                [codeView(h, model), h.div([h.Id('workspace-terminal'), h.Class('min-h-0 border-t border-white/[0.07] bg-[#0b0705] p-2'), h.OnMount(WorkspaceTerminal())], [])],
              ),
            ],
          ),
        ],
      )
    : h.div([], []);
