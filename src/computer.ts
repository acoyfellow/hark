import { Files } from '@cloudflare/sandbox';

export const WORKSPACE = '/workspace';

export const COMPUTER_IMAGE = 'computer';

export const SHELL_ENV: Record<string, string> = {
  PATH: '/usr/local/bin:/usr/bin:/bin',
  HOME: '/root',
  GIT_AUTHOR_NAME: 'hark',
  GIT_AUTHOR_EMAIL: 'hark@users.noreply.github.com',
  GIT_COMMITTER_NAME: 'hark',
  GIT_COMMITTER_EMAIL: 'hark@users.noreply.github.com',
};

const RUN_LIMIT_SECONDS = 120;

const OUTPUT_CAP_BYTES = 64 * 1024;

const INACTIVITY_MS = 60 * 60 * 1000;

const READY_WAIT_MS = 180_000;

const READY_POLL_MS = 1_000;

const STARTING = /not been started|not running|starting/iu;

export type ExecResult = { readonly exitCode: number; readonly stdout: string; readonly stderr: string };

export type Entry = { readonly name: string; readonly type: string };

const SNAPSHOT_COMMAND = `cd ${WORKSPACE} && tar --exclude=node_modules --exclude=.git/objects/pack -czf - . 2>/dev/null | base64 -w0`;

const ARCHIVE_PATH = ['', 'tmp', 'workspace.tgz.b64'].join('/');

const MAX_SNAPSHOT_CHARS = 8 * 1024 * 1024;

export type Computer = {
  readonly running: () => boolean;
  readonly snapshot: () => Promise<string | null>;
  readonly restore: (archive: string) => Promise<void>;
  readonly boot: (secrets: Record<string, string>, fresh?: boolean) => Promise<void>;
  readonly shell: (command: string) => Promise<ExecResult>;
  readonly readFile: (path: string) => Promise<string>;
  readonly writeFile: (path: string, content: string) => Promise<void>;
  readonly list: (path: string) => Promise<Entry[]>;
};

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const untilStarted = async <A>(attempt: () => Promise<A>): Promise<A> => {
  const deadline = Date.now() + READY_WAIT_MS;

  for (;;) {
    try {
      return await attempt();
    } catch (cause) {
      if (!STARTING.test(String(cause)) || Date.now() >= deadline) throw cause;

      await pause(READY_POLL_MS);
    }
  }
};

const decode = (bytes: ArrayBuffer | Uint8Array | string | undefined): string =>
  bytes === undefined ? '' : typeof bytes === 'string' ? bytes : new TextDecoder().decode(bytes);

const capped = (text: string) => (text.length > OUTPUT_CAP_BYTES ? `${text.slice(0, OUTPUT_CAP_BYTES)}\n[output truncated]` : text);

export const inWorkspace = (path: string) => (path.startsWith('/') ? path : path === '' || path === '.' ? WORKSPACE : `${WORKSPACE}/${path.replace(/^(\.\/)+/u, '')}`);

export const sandboxComputer = (container: Container, image: string): Computer => {
  const files = new Files(container);
  let env: Record<string, string> = SHELL_ENV;

  const run = async (argv: readonly string[]) => (await untilStarted(() => container.exec([...argv], { cwd: WORKSPACE, env }))).output();

  return {
    running: () => container.running,
    snapshot: async () => {
      const output = await run(['bash', '-lc', SNAPSHOT_COMMAND]);
      const archive = decode(output.stdout).trim();

      return output.exitCode === 0 && archive.length > 0 && archive.length <= MAX_SNAPSHOT_CHARS ? archive : null;
    },
    restore: async (archive) => {
      await files.writeFile(ARCHIVE_PATH, archive);
      await run(['bash', '-lc', `mkdir -p ${WORKSPACE} && base64 -d ${ARCHIVE_PATH} | tar -xzf - -C ${WORKSPACE} && rm -f ${ARCHIVE_PATH}`]);
    },
    boot: async (secrets, fresh = false) => {
      env = { ...SHELL_ENV, ...secrets };

      if (container.running && !fresh) return;

      if (container.running) await container.destroy().catch(() => undefined);

      container.start({ enableInternet: true, image, labels: { app: 'hark' } } as ContainerStartupOptions);
      await untilStarted(() => container.setInactivityTimeout(INACTIVITY_MS));
    },
    shell: async (command) => {
      const process = await untilStarted(() => container.exec(['timeout', '--kill-after=5', String(RUN_LIMIT_SECONDS), 'bash', '-lc', command], { cwd: WORKSPACE, env }));
      const output = await process.output();

      return { exitCode: output.exitCode, stdout: capped(decode(output.stdout)), stderr: capped(decode(output.stderr)) };
    },
    readFile: async (path) => (await files.readFile(inWorkspace(path))).text(),
    writeFile: async (path, content) => {
      const target = inWorkspace(path);

      await files.mkdir(target.slice(0, target.lastIndexOf('/')) || '/', { recursive: true });
      await files.writeFile(target, content);
    },
    list: async (path) =>
      (await files.readDirectory(inWorkspace(path))).map((entry) => ({ name: entry.name, type: entry.type })).toSorted((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'directory' ? -1 : 1)),
  };
};
