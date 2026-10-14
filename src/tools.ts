import { VOICES, type Visual, type Voice, type WeatherDay } from '../shared/protocol';

export type ToolOutcome = {
  readonly content: string;
  readonly visual?: Visual;
  readonly image?: string;
  readonly sleep?: boolean;
};

export type ToolHost = {
  readonly timeZone: string;
  readonly remember: (fact: string) => number;
  readonly forget: (fact: string) => number;
  readonly setTimer: (seconds: number, label: string) => number;
  readonly cancelTimer: (label: string) => number;
  readonly look: () => Promise<string | null>;
  readonly imagine: (prompt: string) => Promise<string>;
  readonly setVoice: (voice: Voice) => void;
  readonly fetch: typeof fetch;
  readonly id: () => string;
};

type Definition = {
  readonly name: string;
  readonly label: (args: Record<string, unknown>) => string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
  readonly run: (args: Record<string, unknown>, host: ToolHost) => Promise<ToolOutcome>;
};

const str = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value.trim() : fallback;

const num = (value: unknown): number =>
  typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;

const object = (properties: Record<string, unknown>, required: readonly string[]) => ({
  type: 'object',
  properties,
  required,
});

const UA = { 'user-agent': 'hark/0.1 (https://github.com/acoyfellow/hark)' };

const json = async (host: ToolHost, url: string): Promise<Record<string, unknown>> => {
  const response = await host.fetch(url, { headers: UA });

  if (!response.ok) throw new Error(`${new URL(url).hostname} answered ${response.status}`);

  const parsed: unknown = await response.json();

  return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
};

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const rec = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

const WEATHER_WORDS: ReadonlyArray<readonly [number, string]> = [
  [0, 'clear'],
  [2, 'partly cloudy'],
  [3, 'overcast'],
  [48, 'foggy'],
  [57, 'drizzle'],
  [67, 'rain'],
  [77, 'snow'],
  [82, 'rain showers'],
  [86, 'snow showers'],
  [99, 'thunderstorms'],
];

export const weatherWord = (code: number): string =>
  WEATHER_WORDS.find(([upTo]) => code <= upTo)?.[1] ?? 'unsettled';

const weather: Definition = {
  name: 'get_weather',
  label: (args) => `Checking the sky over ${str(args.place, 'there')}`,
  description:
    'Current weather and a short forecast for a city or place. Use for any question about weather, temperature, rain, or what to wear.',
  parameters: object({ place: { type: 'string', description: 'City or place name' } }, ['place']),
  run: async (args, host) => {
    const place = str(args.place);
    const found = rec(
      list(
        (
          await json(
            host,
            `https://geocoding-api.open-meteo.com/v1/search?count=1&format=json&name=${encodeURIComponent(place)}`,
          )
        ).results,
      )[0],
    );

    if (typeof found.latitude !== 'number')
      return { content: `No place called "${place}" was found.` };

    const name = [found.name, found.admin1, found.country_code].filter(Boolean).join(', ');
    const forecast = await json(
      host,
      `https://api.open-meteo.com/v1/forecast?latitude=${found.latitude}&longitude=${found.longitude}&current=temperature_2m,weather_code,wind_speed_10m,apparent_temperature&daily=temperature_2m_max,temperature_2m_min,weather_code&forecast_days=4&timezone=auto`,
    );
    const current = rec(forecast.current);
    const daily = rec(forecast.daily);
    const days: WeatherDay[] = list(daily.time).map((day, index) => ({
      day: str(day),
      high: num(list(daily.temperature_2m_max)[index]),
      low: num(list(daily.temperature_2m_min)[index]),
      code: num(list(daily.weather_code)[index]),
    }));
    const now = num(current.temperature_2m);
    const code = num(current.weather_code);

    return {
      content: JSON.stringify({
        place: name,
        now_celsius: now,
        feels_like_celsius: num(current.apparent_temperature),
        conditions: weatherWord(code),
        wind_kmh: num(current.wind_speed_10m),
        next_days: days.map((day) => ({ ...day, conditions: weatherWord(day.code) })),
      }),
      visual: {
        _tag: 'Weather',
        id: host.id(),
        place: name,
        now,
        code,
        wind: num(current.wind_speed_10m),
        days,
      },
    };
  },
};

const lookUp: Definition = {
  name: 'look_up',
  label: (args) => `Looking up ${str(args.topic, 'that')}`,
  description:
    'Look up a person, place, thing, or event in Wikipedia. Use it for factual questions you are not sure about.',
  parameters: object({ topic: { type: 'string', description: 'What to look up' } }, ['topic']),
  run: async (args, host) => {
    const topic = str(args.topic);
    const search = await json(
      host,
      `https://en.wikipedia.org/w/rest.php/v1/search/page?limit=1&q=${encodeURIComponent(topic)}`,
    );
    const page = rec(list(search.pages)[0]);
    const key = str(page.key);

    if (key === '') return { content: `Wikipedia has nothing on "${topic}".` };

    const summary = await json(
      host,
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(key)}`,
    );
    const title = str(summary.title, key);
    const extract = str(summary.extract);
    const image = str(rec(summary.thumbnail).source) || null;

    return {
      content: JSON.stringify({ title, summary: extract.slice(0, 1600) }),
      visual: {
        _tag: 'Article',
        id: host.id(),
        title,
        summary: extract.slice(0, 280),
        image,
        url: str(rec(rec(summary.content_urls).desktop).page) || `https://en.wikipedia.org/wiki/${key}`,
      },
    };
  },
};

const setTimer: Definition = {
  name: 'set_timer',
  label: (args) => `Setting a timer${str(args.label) === '' ? '' : ` for ${str(args.label)}`}`,
  description:
    'Start a countdown timer or reminder. When it ends you will be told so you can say it out loud.',
  parameters: object(
    {
      seconds: { type: 'number', description: 'Length of the timer in seconds' },
      label: { type: 'string', description: 'Short name, like "pasta" or "call mom"' },
    },
    ['seconds', 'label'],
  ),
  run: async (args, host) => {
    const seconds = Math.round(num(args.seconds));

    if (!(seconds >= 1 && seconds <= 86_400))
      return { content: 'Timers can run from one second to one day.' };

    const label = str(args.label, 'timer') || 'timer';
    const endsAt = host.setTimer(seconds, label);

    return {
      content: `Timer "${label}" set for ${seconds} seconds.`,
      visual: { _tag: 'Timer', id: `timer:${label}`, label, endsAt },
    };
  },
};

const cancelTimer: Definition = {
  name: 'cancel_timer',
  label: () => 'Cancelling a timer',
  description: 'Cancel a running timer by its name.',
  parameters: object({ label: { type: 'string' } }, ['label']),
  run: async (args, host) => {
    const removed = host.cancelTimer(str(args.label));

    return { content: removed > 0 ? 'Cancelled.' : 'No timer by that name was running.' };
  },
};

const remember: Definition = {
  name: 'remember',
  label: () => 'Remembering that',
  description:
    'Save a lasting fact about the person (name, preferences, people, plans). Only when they share something worth keeping or ask you to remember.',
  parameters: object({ fact: { type: 'string', description: 'One short sentence' } }, ['fact']),
  run: async (args, host) => {
    const fact = str(args.fact);

    if (fact === '') return { content: 'Nothing to remember.' };

    host.remember(fact);

    return {
      content: 'Saved.',
      visual: { _tag: 'Memory', id: host.id(), text: fact, forgotten: false },
    };
  },
};

const forget: Definition = {
  name: 'forget',
  label: () => 'Forgetting that',
  description: 'Delete saved facts that match some words, when the person asks you to forget.',
  parameters: object({ fact: { type: 'string', description: 'Words in the fact to forget' } }, [
    'fact',
  ]),
  run: async (args, host) => {
    const fact = str(args.fact);
    const removed = host.forget(fact);

    return {
      content: removed > 0 ? `Forgot ${removed} fact${removed === 1 ? '' : 's'}.` : 'Nothing matched.',
      visual: removed > 0 ? { _tag: 'Memory', id: host.id(), text: fact, forgotten: true } : undefined,
    };
  },
};

const look: Definition = {
  name: 'look',
  label: () => 'Looking through your camera',
  description:
    'See what the person is showing you through their camera. Use whenever they say look, see, show, "what is this", or ask about something in front of them.',
  parameters: object({}, []),
  run: async (_args, host) => {
    const frame = await host.look();

    return frame === null
      ? {
          content:
            'The camera is off. Ask them to tap the camera button at the bottom of the screen, then ask again.',
        }
      : {
          content: 'Here is what the camera sees right now. Describe only what is relevant.',
          image: frame,
          visual: { _tag: 'Glimpse', id: host.id(), src: frame },
        };
  },
};

const imagine: Definition = {
  name: 'imagine',
  label: () => 'Painting it',
  description:
    'Draw a picture and put it on their screen. Use when they ask to draw, paint, imagine, picture, or show something that does not exist yet.',
  parameters: object(
    {
      prompt: {
        type: 'string',
        description: 'A vivid, specific description of the image, with style and lighting',
      },
    },
    ['prompt'],
  ),
  run: async (args, host) => {
    const prompt = str(args.prompt);
    const src = await host.imagine(prompt);

    return {
      content: 'The picture is on their screen now. Say one short line about it, do not describe it in detail.',
      visual: { _tag: 'Image', id: host.id(), prompt, src },
    };
  },
};

const changeVoice: Definition = {
  name: 'change_voice',
  label: (args) => `Becoming ${str(args.voice, 'someone else')}`,
  description: `Switch your speaking voice. Feminine: luna, asteria, athena, aurora, thalia, helena. Masculine: orion, apollo, arcas, zeus, odysseus, draco.`,
  parameters: object({ voice: { type: 'string', enum: [...VOICES] } }, ['voice']),
  run: async (args, host) => {
    const voice = VOICES.find((each) => each === str(args.voice).toLowerCase());

    if (voice === undefined) return { content: `Unknown voice. Pick one of ${VOICES.join(', ')}.` };

    host.setVoice(voice);

    return { content: `Your voice is now ${voice}. Say a short hello in it.` };
  },
};

const rest: Definition = {
  name: 'rest',
  label: () => 'Going quiet',
  description:
    'Stop listening and go to sleep. Use when the person says goodbye, thanks that is all, stop listening, or go to sleep.',
  parameters: object({}, []),
  run: async () => ({ content: 'Say a very short goodbye. The microphone closes after it.', sleep: true }),
};

export const TOOLS: readonly Definition[] = [
  weather,
  lookUp,
  setTimer,
  cancelTimer,
  remember,
  forget,
  look,
  imagine,
  changeVoice,
  rest,
];

export const toolSchemas = () =>
  TOOLS.map((tool) => ({
    type: 'function',
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  }));

export const parseArguments = (raw: string): Record<string, unknown> => {
  try {
    return rec(JSON.parse(raw === '' ? '{}' : raw));
  } catch {
    return {};
  }
};

export const toolLabel = (name: string, args: Record<string, unknown>): string =>
  TOOLS.find((tool) => tool.name === name)?.label(args) ?? 'Working on it';

export const runTool = async (
  name: string,
  args: Record<string, unknown>,
  host: ToolHost,
): Promise<ToolOutcome> => {
  const tool = TOOLS.find((each) => each.name === name);

  if (tool === undefined) return { content: `There is no tool called ${name}.` };

  try {
    return await tool.run(args, host);
  } catch (cause) {
    return {
      content: `That did not work: ${cause instanceof Error ? cause.message : String(cause)}`,
    };
  }
};
