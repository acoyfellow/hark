export const MIN_EVERY_SECONDS = 60;

export const MAX_ROUTINES = 12;

export const MAX_RUNS = 500;

export type Routine = {
  readonly id: string;
  readonly task: string;
  readonly every: number | null;
  readonly at: string | null;
  readonly made: number;
  readonly runs: number;
  readonly limit: number | null;
  readonly schedule: string;
};

const WORD_SECONDS: Record<string, number> = { second: 1, minute: 60, hour: 3600, day: 86_400, week: 604_800 };

const UNIT = new RegExp(String.raw`^(\d+(?:\.\d+)?)?\s*(second|sec|minute|min|hour|hr|day|week)s?$`, 'u');

const SHORT: Record<string, string> = { sec: 'second', min: 'minute', hr: 'hour' };

export const secondsOf = (spoken: string): number | null => {
  const found = UNIT.exec(spoken.trim().toLowerCase().replace(/^every\s+/u, '').replace(/^an?\s+/u, '1 '));
  if (found === null) return null;
  const unit = SHORT[found[2] ?? ''] ?? found[2] ?? '';
  const amount = Number(found[1] ?? '1');
  const seconds = amount * (WORD_SECONDS[unit] ?? 0);
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : null;
};

const CLOCK = new RegExp(String.raw`^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$`, 'u');

export const dailyCron = (time: string, offsetMinutes: number): string | null => {
  const found = CLOCK.exec(time.trim().toLowerCase());
  if (found === null) return null;
  let hour = Number(found[1]);
  const minute = Number(found[2] ?? '0');
  if (found[3] === 'pm' && hour < 12) hour += 12;
  if (found[3] === 'am' && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  const utc = (((hour * 60 + minute + offsetMinutes) % 1440) + 1440) % 1440;
  return `${utc % 60} ${Math.floor(utc / 60)} * * *`;
};

export const zoneOffsetMinutes = (timeZone: string, now = new Date()) => {
  try {
    const local = new Date(now.toLocaleString('en-US', { timeZone }));
    const utc = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    return Math.round((utc.getTime() - local.getTime()) / 60_000);
  } catch {
    return 0;
  }
};

export const describeRoutine = (routine: Routine) =>
  `${routine.task} (${routine.every === null ? `daily at ${routine.at ?? '?'}` : `every ${routine.every >= 3600 ? `${routine.every / 3600} h` : `${Math.round(routine.every / 60)} min`}`}, ran ${routine.runs}${routine.limit === null ? '' : ` of ${routine.limit}`})`;

export const ROUTINE_PROMPT = (task: string, runs: number) =>
  [
    'This is a scheduled run of a routine they set up. They are not on the line and cannot answer.',
    `The routine: ${task}`,
    `This is run number ${runs + 1}.`,
    'Use tools to get real data if the task needs it (look things up, the cloudflare tool with GET, the terminal). Do not change anything and do not ask questions.',
    'Then answer in two or three short sentences they will read on their phone. Start with the result, not with "Sure".',
  ].join('\n');

export const ROUTINE_SAFE_TOOLS = new Set(['look_up', 'web_search', 'cloudflare', 'terminal', 'files', 'run_code', 'mcp', 'remember', 'capabilities']);
