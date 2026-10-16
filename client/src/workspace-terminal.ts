import { Effect } from 'effect';
import { Mount } from 'foldkit';
import { mount, type Terminal } from 'cloudterm';
import 'cloudterm/style.css';
import { Message } from './message';

const TERMINAL_THEME = { background: '#0b0705', foreground: '#ffe7c4', cursor: '#f6821f', fontSize: 13 };

const terminalUrl = (cols: number, rows: number) => {
  const url = new URL('/workspace/terminal', location.href);

  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('cols', String(cols));
  url.searchParams.set('rows', String(rows));

  return url.toString();
};

type Live = { terminal: Terminal | null; socket: WebSocket | null; closed: boolean };

const connect = async (element: HTMLElement, live: Live) => {
  const terminal = await mount(element, {
    onData: (bytes) => {
      if (live.socket?.readyState === WebSocket.OPEN) live.socket.send(bytes);
    },
    onResize: (cols, rows) => {
      if (live.socket?.readyState === WebSocket.OPEN) live.socket.send(JSON.stringify({ resize: [cols, rows] }));
    },
    theme: TERMINAL_THEME,
  });

  if (live.closed) {
    terminal.destroy();

    return;
  }

  live.terminal = terminal;
  terminal.fit();

  const socket = new WebSocket(terminalUrl(terminal.cols, terminal.rows));

  socket.binaryType = 'arraybuffer';
  socket.addEventListener('message', (event) => terminal.write(typeof event.data === 'string' ? event.data : new Uint8Array(event.data as ArrayBuffer)));
  socket.addEventListener('close', () => {
    if (!live.closed) terminal.write('\r\n\x1b[2m[terminal closed, reopen the workspace to reconnect]\x1b[0m\r\n');
  });
  live.socket = socket;
  element.dataset.terminal = 'connecting';
  socket.addEventListener('open', () => {
    element.dataset.terminal = 'live';
    terminal.focus();
  });
};

export const WorkspaceTerminal = Mount.define('WorkspaceTerminal', {
  messages: [Message.CompletedMount],
  execute: ({ element }) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const live: Live = { terminal: null, socket: null, closed: false };
        const host = element instanceof HTMLElement ? element : null;

        if (host !== null) void connect(host, live);

        const refit = () => live.terminal?.fit();

        addEventListener('resize', refit);

        return { live, refit };
      }),
      ({ live, refit }) =>
        Effect.sync(() => {
          live.closed = true;
          removeEventListener('resize', refit);
          live.socket?.close();
          live.terminal?.destroy();
        }),
    ).pipe(Effect.as(Message.CompletedMount())),
});
