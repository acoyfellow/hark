import { Option } from 'effect';
import type { Html, HtmlBuilder } from 'foldkit/html';
import { BRAINS, DEFAULT_BRAIN, DEFAULT_ENGINE, DEFAULT_VOICE, ENGINES, MAX_INSTRUCTIONS, type McpServer, type Settings, voicesFor } from '../../../shared/protocol';
import { TOOL_CATALOG, TOOL_GROUPS, type CatalogTool } from '../../../shared/tool-catalog';
import { Message } from '../message';
import type { Model, PushState, SettingsTab } from '../model';
import { icon, type IconName } from './icons';

type H = HtmlBuilder<Message>;

type Tab = { readonly id: SettingsTab; readonly label: string; readonly hint: string; readonly icon: IconName; readonly words: string };

const TABS: readonly Tab[] = [
  { id: 'account', label: 'Account', hint: 'What is running, sign out', icon: 'user', words: 'account sign out cloudflare running models route memories push notifications' },
  { id: 'voice', label: 'Voice', hint: 'How hark sounds', icon: 'wave', words: 'voice aura speak sound engine quick rich' },
  { id: 'brain', label: 'Brain', hint: 'Which model thinks, your instructions', icon: 'brain', words: 'brain model think llm phonellm gpt claude glm system prompt instructions personality rules' },
  { id: 'tools', label: 'Tools', hint: 'What hark can do, MCP servers', icon: 'tools', words: 'tools mcp servers connect capabilities do' },
];

const settingsOf = (model: Model): Settings =>
  Option.getOrElse(model.settings, () => ({ voice: DEFAULT_VOICE, brain: DEFAULT_BRAIN, engine: DEFAULT_ENGINE }));

const matches = (query: string, ...texts: readonly string[]) => {
  const wanted = query.trim().toLowerCase();

  return wanted === '' || texts.some((text) => text.toLowerCase().includes(wanted));
};

const heading = (h: H, text: string): Html => h.h3([h.Class('mb-2.5 font-mono text-[10.5px] tracking-[0.14em] text-white/40 uppercase')], [text]);

const section = (h: H, title: string, children: readonly Html[]): Html => h.section([h.Class('mb-7 last:mb-0')], [heading(h, title), ...children]);

const choice = (h: H, selected: boolean, title: string, note: string, message: Message): Html =>
  h.button(
    [
      h.Type('button'),
      h.AriaPressed(String(selected)),
      h.Class(
        `group flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition ${selected ? 'border-ember/50 bg-ember/[0.08]' : 'border-white/[0.07] bg-white/[0.015] hover:border-white/15 hover:bg-white/[0.03]'}`,
      ),
      h.OnClick(message),
    ],
    [
      h.span([h.Class(`mt-1 grid size-4 flex-none place-items-center rounded-full border ${selected ? 'border-ember' : 'border-white/25'}`)], selected ? [h.span([h.Class('size-2 rounded-full bg-ember')], [])] : []),
      h.span([h.Class('flex min-w-0 flex-col gap-0.5')], [h.span([h.Class('text-[13.5px] font-medium text-white')], [title]), h.span([h.Class('text-[12px] leading-snug text-white/45')], [note])]),
    ],
  );

const pill = (h: H, selected: boolean, label: string, message: Message): Html =>
  h.button(
    [
      h.Type('button'),
      h.AriaPressed(String(selected)),
      h.Class(`rounded-full border px-3.5 py-1.5 text-[13px] capitalize transition ${selected ? 'border-ember/60 bg-ember/10 text-white' : 'border-white/10 text-white/60 hover:border-white/25 hover:text-white'}`),
      h.OnClick(message),
    ],
    [label],
  );

const fact = (h: H, label: string, value: string): Html =>
  h.div([h.Class('flex items-center justify-between gap-4 py-2.5 text-[13px]')], [h.span([h.Class('text-white/45')], [label]), h.span([h.Class('truncate font-mono text-[12px] text-white/85')], [value])]);

const PUSH_COPY: Record<PushState, { readonly line: string; readonly action: string | null }> = {
  default: { line: 'Get a ping when a timer ends or a job in your computer finishes, even with hark closed.', action: 'Enable' },
  granted: { line: 'On for this device. hark can reach you when it is closed.', action: null },
  denied: { line: 'Blocked in this browser. Allow notifications for this site in its settings, then come back.', action: null },
  unsupported: { line: 'This browser cannot show notifications. On iPhone, add hark to your Home Screen first.', action: null },
};

const pushSection = (h: H, model: Model): Html => {
  const copy = PUSH_COPY[model.push];

  return section(h, 'Notifications', [
    h.div(
      [h.Class('flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-3')],
      [
        h.span([h.Class(`size-2 flex-none rounded-full ${model.push === 'granted' ? 'bg-emerald-400' : model.push === 'denied' ? 'bg-red-400' : 'bg-white/30'}`)], []),
        h.span([h.Class('flex min-w-0 flex-1 flex-col')], [h.span([h.Class('text-[13.5px] font-medium')], ['Push notifications']), h.span([h.Class('text-[12px] leading-snug text-white/45')], [copy.line])]),
        ...(copy.action === null
          ? []
          : [h.button([h.Type('button'), h.Id('enable-push'), h.Class('rounded-lg bg-ember px-3.5 py-1.5 text-[12.5px] font-medium text-black hover:bg-amber'), h.OnClick(Message.ClickedEnablePush())], [copy.action])]),
      ],
    ),
  ]);
};

const accountTab = (h: H, model: Model): readonly Html[] => {
  const settings = settingsOf(model);
  const brain = BRAINS.find((each) => each.id === settings.brain)?.label ?? settings.brain;

  return [
    section(h, 'Signed in', [
      h.div(
        [h.Class('flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-3')],
        [
          h.span([h.Class('grid size-9 flex-none place-items-center rounded-full bg-ember/15 text-ember')], [icon(h, 'user', 'size-4')]),
          h.span(
            [h.Class('flex min-w-0 flex-col')],
            [
              h.span([h.Class('truncate text-[13.5px] font-medium')], [Option.getOrElse(model.account, () => 'Your Cloudflare account')]),
              h.span([h.Class('text-[12px] text-white/45')], [model.connected ? 'Connected now' : 'Connects when you wake hark']),
            ],
          ),
        ],
      ),
    ]),
    section(h, 'Biometrics for changes', [
      h.button(
        [h.Type('button'), h.Id('guard'), h.Role('switch'), h.AriaChecked(model.guard), h.Class('flex w-full items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-3 text-left hover:border-ember/40'), h.OnClick(Message.ToggledGuard())],
        [
          h.span(
            [h.Class('flex min-w-0 flex-1 flex-col')],
            [
              h.span([h.Class('text-[13.5px] font-medium')], [model.guard ? 'On: changes need your passkey' : 'Off: a spoken yes is enough']),
              h.span([h.Class('text-[12px] leading-snug text-white/45')], ['Account changes, commands, file writes, MCP calls, prompt edits and deletes wait for Face ID, Touch ID or a security key. Each signature covers one exact call, once, for a minute. Turning it off needs the passkey too.']),
            ],
          ),
          h.span([h.Class(`relative h-6 w-10 flex-none rounded-full transition ${model.guard ? 'bg-ember' : 'bg-white/15'}`)], [h.span([h.Class(`absolute top-0.5 size-5 rounded-full bg-white transition-all ${model.guard ? 'left-[18px]' : 'left-0.5'}`)], [])]),
        ],
      ),
      ...(model.passkeyNote === '' ? [] : [h.p([h.Id('passkey-note'), h.Class('mt-2 text-[12px] text-white/55')], [model.passkeyNote])]),
    ]),
    section(h, 'Running on your Cloudflare', [
      h.div(
        [h.Class('divide-y divide-white/[0.06] rounded-xl border border-white/[0.07] px-3.5')],
        [
          fact(h, 'Brain', brain),
          fact(h, 'Ears', 'Deepgram Flux'),
          fact(h, 'Voice', `${settings.engine === 'aura-1' ? 'Aura 1' : 'Aura 2'} · ${settings.voice}`),
          fact(h, 'Pictures', 'FLUX.2 klein'),
          fact(h, 'Computer', 'One durable sandbox'),
          fact(h, 'MCP servers', String(model.servers.length)),
          fact(h, 'Memories', String(model.memories)),
        ],
      ),
      h.p([h.Class('mt-3 text-[12px] leading-relaxed text-white/40')], ['Every word is heard, thought and spoken on your own Workers AI. Your token never leaves your Durable Object.']),
    ]),
    pushSection(h, model),
      h.button(
        [
          h.Type('button'),
          h.Id('sign-out'),
          h.Class('flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 py-2.5 text-[13px] text-white/70 transition hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-200'),
          h.OnClick(Message.ClickedSignOut()),
        ],
        [icon(h, 'logout', 'size-4'), 'Sign out'],
      ),
  ];
};

const voiceTab = (h: H, model: Model): readonly Html[] => {
  const settings = settingsOf(model);

  return [
    section(h, 'Engine', [
      h.div([h.Class('grid gap-2 sm:grid-cols-2')], ENGINES.map((engine) => choice(h, settings.engine === engine.id, engine.label, engine.note, Message.PickedEngine({ engine: engine.id })))),
    ]),
    section(h, 'Voice', [
      h.div([h.Class('flex flex-wrap gap-2')], voicesFor(settings.engine).filter((voice) => matches(model.query, voice)).map((voice) => pill(h, settings.voice === voice, voice, Message.PickedVoice({ voice: voice as Settings['voice'] })))),
      h.p([h.Class('mt-3 text-[12px] text-white/40')], ['Or just say "switch to a deeper voice".']),
    ]),
  ];
};

const brainTab = (h: H, model: Model): readonly Html[] => {
  const settings = settingsOf(model);
  const brains = BRAINS.filter((brain) => matches(model.query, brain.label, brain.note, brain.id));
  const onAccount = brains.filter((brain) => !brain.id.startsWith('gateway/'));
  const viaGateway = brains.filter((brain) => brain.id.startsWith('gateway/'));
  const list = (items: typeof brains) => h.div([h.Class('grid gap-2')], items.map((brain) => choice(h, settings.brain === brain.id, brain.label, brain.note, Message.PickedBrain({ brain: brain.id }))));

  const draft = Option.getOrElse(model.instructionsDraft, () => model.instructions);
  const dirty = Option.isSome(model.instructionsDraft) && draft !== model.instructions;

  return [
    section(h, 'Your instructions', [
      h.p([h.Class('mb-2 text-[12px] leading-snug text-white/45')], ['Added to hark\'s system prompt every turn. Its safety and voice rules always stay. Or say "from now on, ..." or "reset your prompt".']),
      h.textarea([
        h.Id('instructions'),
        h.Value(draft),
        h.Placeholder('e.g. Call me Jordan. Keep answers to one sentence. Always show a shape.'),
        h.Class('min-h-[96px] w-full resize-y rounded-xl border border-white/[0.09] bg-white/[0.03] px-3.5 py-3 text-[13px] leading-relaxed text-white outline-none placeholder:text-white/30 focus:border-ember/50'),
        h.OnInput((text) => Message.TypedInstructions({ text })),
      ]),
      h.div(
        [h.Class('mt-2 flex items-center gap-2')],
        [
          h.button([h.Type('button'), h.Id('save-instructions'), h.Disabled(!dirty), h.Class('rounded-full bg-ember px-4 py-1.5 text-[12.5px] font-medium text-black disabled:opacity-30'), h.OnClick(Message.SavedInstructions())], ['Save']),
          h.button([h.Type('button'), h.Id('reset-instructions'), h.Disabled(model.instructions === '' && !dirty), h.Class('rounded-full border border-white/10 px-4 py-1.5 text-[12.5px] text-white/70 disabled:opacity-30'), h.OnClick(Message.ResetInstructions())], ['Reset to default']),
          h.span([h.Class('ml-auto font-mono text-[10.5px] text-white/35')], [`${draft.length} / ${MAX_INSTRUCTIONS}`]),
        ],
      ),
    ]),
    ...(onAccount.length === 0 ? [] : [section(h, 'Workers AI on your account', [list(onAccount)])]),
    ...(viaGateway.length === 0 ? [] : [section(h, 'Through your AI Gateway', [list(viaGateway)])]),
    ...(brains.length === 0 ? [h.p([h.Class('text-[13px] text-white/45')], ['No brain matches that.'])] : []),
  ];
};

const toolRow = (h: H, tool: CatalogTool): Html =>
  h.div(
    [h.Class('flex items-start justify-between gap-4 py-2.5')],
    [
      h.span([h.Class('text-[13.5px] font-medium text-white')], [tool.title]),
      h.span([h.Class('text-right text-[12.5px] text-white/45 italic')], [`"${tool.say}"`]),
    ],
  );

const STATE_DOT: Record<string, string> = { ready: 'bg-emerald-400', connected: 'bg-emerald-400', authenticating: 'bg-amber-400', connecting: 'bg-amber-400', failed: 'bg-red-400' };

const serverRow = (h: H, server: McpServer): Html =>
  h.div(
    [h.Class('flex items-center gap-3 py-3')],
    [
      h.span([h.Class(`size-2 flex-none rounded-full ${STATE_DOT[server.state] ?? 'bg-white/30'}`)], []),
      h.span(
        [h.Class('flex min-w-0 flex-1 flex-col')],
        [
          h.span([h.Class('truncate text-[13.5px] font-medium')], [server.name]),
          h.span([h.Class('truncate font-mono text-[11.5px] text-white/40')], [server.error ?? `${server.host} · ${server.tools} ${server.tools === 1 ? 'tool' : 'tools'}`]),
        ],
      ),
      ...(server.authUrl === null
        ? []
        : [h.a([h.Href(server.authUrl), h.Target('_blank'), h.Rel('noopener'), h.Class('rounded-lg bg-ember px-3 py-1.5 text-[12px] font-medium text-black hover:bg-amber')], ['Sign in'])]),
      h.button(
        [h.Type('button'), h.AriaLabel(`Remove ${server.name}`), h.Class('grid size-8 place-items-center rounded-lg text-white/40 hover:bg-white/[0.06] hover:text-red-300'), h.OnClick(Message.ClickedRemoveServer({ id: server.id }))],
        [icon(h, 'trash', 'size-4')],
      ),
    ],
  );

const addServer = (h: H, model: Model): Html =>
  h.form(
    [h.Class('mt-3 rounded-xl border border-dashed border-white/15 p-3'), h.OnSubmit(Message.SubmittedServer())],
    [
      h.div(
        [h.Class('flex flex-col gap-2 sm:flex-row')],
        [
          h.input([
            h.Type('url'),
            h.Name('url'),
            h.Placeholder('https://your-server.example/mcp'),
            h.Value(model.draft.url),
            h.Autocomplete('off'),
            h.Spellcheck(false),
            h.AriaLabel('MCP server URL'),
            h.Class('min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-[12.5px] text-white placeholder:text-white/30 focus:border-ember/60 focus:outline-none'),
            h.OnInput((url) => Message.TypedServerUrl({ url })),
          ]),
          h.input([
            h.Type('password'),
            h.Name('token'),
            h.Placeholder('Token (optional)'),
            h.Value(model.draft.token),
            h.Autocomplete('off'),
            h.AriaLabel('MCP server token, optional'),
            h.Class('rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-[12.5px] text-white placeholder:text-white/30 focus:border-ember/60 focus:outline-none sm:w-40'),
            h.OnInput((token) => Message.TypedServerToken({ token })),
          ]),
          h.button(
            [h.Type('submit'), h.Disabled(model.draft.pending), h.Class('flex items-center justify-center gap-1.5 rounded-lg bg-ember px-4 py-2 text-[13px] font-medium text-black transition hover:bg-amber disabled:opacity-60')],
            [icon(h, 'plus', 'size-4'), model.draft.pending ? 'Connecting' : 'Connect'],
          ),
        ],
      ),
      ...Option.match(model.draft.note, {
        onNone: () => [h.p([h.Class('mt-2 text-[12px] text-white/40')], ['Or just say "connect my server" and read out the URL.'])],
        onSome: (note) => [
          h.div(
            [h.Class('mt-2 flex items-center gap-3 text-[12.5px] text-white/70')],
            [
              h.span([h.Class('flex-1')], [note]),
              ...Option.match(model.draft.authUrl, {
                onNone: () => [],
                onSome: (url) => [h.a([h.Href(url), h.Target('_blank'), h.Rel('noopener'), h.Class('rounded-lg bg-ember px-3 py-1.5 text-[12px] font-medium text-black')], ['Sign in'])],
              }),
            ],
          ),
        ],
      }),
    ],
  );

const toolsTab = (h: H, model: Model): readonly Html[] => {
  const servers = model.servers.filter((server) => matches(model.query, server.name, server.host));
  const groups = TOOL_GROUPS.map((group) => ({ group, tools: TOOL_CATALOG.filter((tool) => tool.group === group && matches(model.query, tool.title, tool.say, tool.name, group)) })).filter((entry) => entry.tools.length > 0);

  const builtIn = groups.map(({ group, tools }) => section(h, group, [h.div([h.Class('divide-y divide-white/[0.06] rounded-xl border border-white/[0.07] px-3.5')], tools.map((tool) => toolRow(h, tool)))]));
  const mcpTools = model.servers.reduce((total, server) => total + server.tools, 0);

  return [
    h.p([h.Id('tool-count'), h.Class('mb-5 font-mono text-[11px] tracking-[0.1em] text-white/45 uppercase')], [`${TOOL_CATALOG.length} built-in tools · ${model.servers.length} MCP servers · ${mcpTools} MCP tools. Or ask "what can you do?"`]),
    ...builtIn,
    section(h, 'Your computer', [
      h.button(
        [h.Type('button'), h.Id('settings-open-workspace'), h.Class('flex w-full items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-3 text-left hover:border-ember/40'), h.OnClick(Message.ClickedWorkspace())],
        [icon(h, 'terminal', 'size-4 text-ember'), h.span([h.Class('flex flex-col')], [h.span([h.Class('text-[13.5px] font-medium')], ['Open the workspace']), h.span([h.Class('text-[12px] text-white/45')], ['Files, code and a terminal on your durable Linux box. Or say "open my computer".'])])],
      ),
    ]),
    section(h, 'Your MCP servers', [
      servers.length === 0
        ? h.p([h.Class('rounded-xl border border-white/[0.07] px-3.5 py-3 text-[13px] text-white/45')], [model.servers.length === 0 ? 'None yet. Connect any MCP server and hark can call its tools by voice.' : 'No server matches that.'])
        : h.div([h.Class('divide-y divide-white/[0.06] rounded-xl border border-white/[0.07] px-3.5')], servers.map((server) => serverRow(h, server))),
      addServer(h, model),
    ]),
  ];
};

const TAB_BODY: Record<SettingsTab, (h: H, model: Model) => readonly Html[]> = { account: accountTab, voice: voiceTab, brain: brainTab, tools: toolsTab };

const tabButton = (h: H, model: Model, tab: Tab): Html =>
  h.button(
    [
      h.Type('button'),
      h.Role('tab'),
      h.AriaSelected(model.tab === tab.id),
      h.DataAttribute('tab', tab.id),
      h.Class(
        `relative flex min-w-max items-center gap-2.5 rounded-lg px-3 py-2 text-left transition sm:min-w-0 ${model.tab === tab.id ? 'bg-white/[0.06] text-white sm:before:absolute sm:before:inset-y-2 sm:before:-left-2 sm:before:w-0.5 sm:before:rounded-full sm:before:bg-ember' : 'text-white/55 hover:bg-white/[0.03] hover:text-white'}`,
      ),
      h.OnClick(Message.PickedTab({ tab: tab.id })),
    ],
    [
      icon(h, tab.icon, 'size-4 flex-none'),
      h.span([h.Class('flex flex-col')], [h.span([h.Class('text-[13.5px] font-medium')], [tab.label]), h.span([h.Class('hidden text-[11.5px] text-white/40 sm:block')], [tab.hint])]),
    ],
  );

export const commandSheet = (h: H, model: Model): Html => {
  const tabs = TABS.filter((tab) => matches(model.query, tab.label, tab.hint, tab.words) || tab.id === model.tab);

  return h.div(
    [h.Class(`fixed inset-0 z-50 ${model.sheet ? '' : 'pointer-events-none invisible delay-200'}`), h.AriaHidden(!model.sheet), h.DataAttribute('sheet-open', String(model.sheet))],
    [
      h.div([h.Class(`absolute inset-0 bg-black/60 backdrop-blur-[3px] transition-opacity duration-200 ${model.sheet ? 'opacity-100' : 'opacity-0'}`), h.OnClick(Message.ClosedSheet())], []),
      h.div(
        [
          h.Role('dialog'),
          h.AriaModal(true),
          h.AriaLabel('Settings'),
          h.Inert(!model.sheet),
          h.Class(
            `absolute top-[max(0.5rem,env(safe-area-inset-top))] left-1/2 flex h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] -translate-x-1/2 flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/95 shadow-[0_28px_80px_rgba(0,0,0,.5)] backdrop-blur-xl transition duration-200 sm:top-[8vh] sm:h-[min(640px,84dvh)] sm:w-[min(760px,calc(100vw-2rem))] ${model.sheet ? 'scale-100 opacity-100' : 'scale-[0.98] opacity-0'}`,
          ),
        ],
        [
          h.header(
            [h.Class('flex flex-none items-center gap-2.5 border-b border-white/[0.07] p-3')],
            [
              h.label(
                [h.Class('flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-white/10 bg-black/30 px-3 text-white/45 focus-within:border-ember/50 focus-within:text-white')],
                [
                  icon(h, 'search', 'size-4 flex-none'),
                  h.input([
                    h.Type('text'),
                    h.Id('settings-search'),
                    h.Placeholder('Search settings and tools'),
                    h.Value(model.query),
                    h.Autocomplete('off'),
                    h.Spellcheck(false),
                    h.AriaLabel('Search settings and tools'),
                    h.Class('min-w-0 flex-1 bg-transparent text-[14.5px] text-white placeholder:text-white/35 focus:outline-none'),
                    h.OnInput((query) => Message.TypedQuery({ query })),
                  ]),
                  h.kbd([h.Class('hidden rounded-md border border-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white/40 sm:inline')], ['⌘K']),
                ],
              ),
              h.button(
                [h.Type('button'), h.AriaLabel('Close settings'), h.Class('h-11 rounded-xl border border-white/10 px-3 text-[12px] text-white/55 hover:border-white/25 hover:text-white'), h.OnClick(Message.ClosedSheet())],
                ['Esc'],
              ),
            ],
          ),
          h.div(
            [h.Class('grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] sm:grid-cols-[200px_minmax(0,1fr)] sm:grid-rows-1')],
            [
              h.nav(
                [h.Role('tablist'), h.AriaLabel('Settings sections'), h.Class('flex gap-1 overflow-x-auto border-b border-white/[0.07] p-2 [scrollbar-width:none] sm:flex-col sm:border-r sm:border-b-0 sm:p-3')],
                tabs.map((tab) => tabButton(h, model, tab)),
              ),
              h.div([h.Role('tabpanel'), h.DataAttribute('panel', model.tab), h.Class('own-scroll min-h-0 p-4 sm:p-6')], [...TAB_BODY[model.tab](h, model)]),
            ],
          ),
        ],
      ),
    ],
  );
};
