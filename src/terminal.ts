import { WORKSPACE } from './computer';

export const TERMINAL_SESSION = 'hark';

export type TerminalSize = { readonly cols: number; readonly rows: number };

export const terminalSize = (url: URL): TerminalSize => {
  const cols = Number(url.searchParams.get('cols'));
  const rows = Number(url.searchParams.get('rows'));

  return {
    cols: Number.isInteger(cols) && cols >= 20 && cols <= 400 ? cols : 100,
    rows: Number.isInteger(rows) && rows >= 5 && rows <= 200 ? rows : 30,
  };
};

const TMUX_CONF = ['set -g status off', 'set -g mouse off', 'set -g history-limit 20000', 'set -g default-terminal xterm-256color', 'set -sg escape-time 0', 'set -g window-size latest'].join('\n');

export const attachCommand = (session = TERMINAL_SESSION) => [
  'bash',
  '-c',
  `mkdir -p ${WORKSPACE} && printf '%s\\n' "$1" > /root/.tmux.conf; exec tmux -f /root/.tmux.conf new-session -A -s "$2" -c ${WORKSPACE}`,
  'attach',
  TMUX_CONF,
  session,
];

export const TERMINAL_ENV = { TERM: 'xterm-256color', LANG: 'C.UTF-8', HOME: '/root' };

const resizeOf = (frame: string): TerminalSize | null => {
  try {
    const parsed = JSON.parse(frame) as { resize?: [number, number] };

    return Array.isArray(parsed.resize) ? { cols: parsed.resize[0], rows: parsed.resize[1] } : null;
  } catch {
    return null;
  }
};

export const bridgeTerminal = (socket: WebSocket, process: ExecProcess, abort: AbortController) => {
  const input = process.stdin?.getWriter();
  const output = process.stdout;

  if (input === undefined || output === null) {
    socket.close(1011, 'no terminal streams');

    return;
  }

  const stop = () => abort.abort();
  const encoder = new TextEncoder();

  socket.addEventListener('message', (event) => {
    if (typeof event.data !== 'string') {
      input.write(new Uint8Array(event.data as ArrayBuffer)).catch(stop);

      return;
    }

    const size = resizeOf(event.data);

    if (size !== null) process.resize(size.cols, size.rows);
    else input.write(encoder.encode(event.data)).catch(stop);
  });
  socket.addEventListener('close', stop);
  socket.addEventListener('error', stop);

  void (async () => {
    try {
      for await (const chunk of output as ReadableStream<Uint8Array>) {
        if (abort.signal.aborted) break;

        socket.send(chunk);
      }
      socket.close(1000, 'exit');
    } catch {
      if (!abort.signal.aborted) socket.close(1011, 'terminal output failed');
    }
  })();
};
