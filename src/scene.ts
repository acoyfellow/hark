export const SIGHT_MODEL = '@cf/cloudflare/clef-flash';

export const SIGHT_MIN_CONFIDENCE = 0.55;

export const SIGHT_STALE_MS = 8000;

const options = (labels: readonly string[]) => Object.fromEntries(labels.map((label) => [label, label]));

const OBJECTS = ['nothing in particular', 'phone', 'cup or mug', 'bottle or can', 'book or paper', 'food', 'fruit', 'toy', 'pet', 'keys', 'pen or pencil', 'laptop or screen', 'headphones', 'glasses', 'plant', 'drawing or sign', 'other object'] as const;

const MOODS = ['no face', 'neutral', 'smiling', 'laughing', 'surprised', 'sad', 'frowning', 'thinking'] as const;

const GESTURES = ['none', 'wave', 'thumbs up', 'thumbs down', 'pointing', 'peace sign', 'open palm', 'fist', 'counting fingers', 'heart hands'] as const;

const PLACES = ['desk or office', 'kitchen', 'living room', 'bedroom', 'outdoors', 'car', 'screen or webpage', 'dark or covered', 'other'] as const;

export type Taught = { readonly label: string; readonly description: string; readonly example: string | null };

export const MAX_TAUGHT_EXAMPLES = 3;

export const taughtExamples = (taught: readonly Taught[]) => taught.filter((each) => each.example !== null).slice(-MAX_TAUGHT_EXAMPLES);

export const TAUGHT_MIN_P = 0.7;

const taughtId = (index: number) => `taught_${index}`;

export const sightQuestions = (taught: readonly Taught[]) => {
  const shown = taughtExamples(taught);
  const imageOf = (each: Taught) => shown.indexOf(each);

  return {
    ...SIGHT_QUESTIONS,
    ...Object.fromEntries(
      taught.map((each, index) => [
        taughtId(index),
        {
          type: 'noul',
          instructions:
            imageOf(each) === -1
              ? `Is "${each.label}" (${each.description || each.label}) visible in image 1, the live camera?`
              : `Image ${imageOf(each) + 2} is the person's own example of "${each.label}" (${each.description || each.label}). Is ${each.label}, or an item that looks like it, visible in image 1?`,
        },
      ]),
    ),
  };
};

export const recognised = (raw: unknown, taught: readonly Taught[]): { readonly label: string; readonly p: number } | null => {
  const answers = record(record(raw).answers) as Record<string, Answer>;
  const scored = taught.map((each, index) => ({ label: each.label, p: answers[taughtId(index)]?.noul ?? 0 })).toSorted((a, b) => b.p - a.p);
  const best = scored[0];

  return best !== undefined && best.p >= TAUGHT_MIN_P ? best : null;
};

export const SIGHT_QUESTIONS = {
  person: { type: 'noul', instructions: 'Is a person visible in the camera view?' },
  holding: { type: 'choice', instructions: 'What is the main object the person holds up or shows to the camera, or the main object in the center?', criteria: options(OBJECTS) },
  mood: { type: 'choice', instructions: 'Facial expression of the main person.', criteria: options(MOODS) },
  gesture: { type: 'choice', instructions: 'Hand gesture the person is making right now.', criteria: options(GESTURES) },
  place: { type: 'choice', instructions: 'Where is the camera?', criteria: options(PLACES) },
  moved: { type: 'noul', instructions: 'Is the person moving or waving quickly (motion blur)?' },
} as const;

export type Scene = {
  readonly at: number;
  readonly person: number;
  readonly holding: string;
  readonly mood: string;
  readonly gesture: string;
  readonly place: string;
  readonly confidence: Readonly<Record<string, number>>;
};

type Answer = { readonly type?: string; readonly choice?: string; readonly noul?: number; readonly confidence?: number; readonly probabilities?: Record<string, number> };

const record = (value: unknown): Record<string, unknown> => (typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {});

const choiceOf = (answer: Answer | undefined, fallback: string) => {
  const choice = answer?.choice ?? fallback;

  return { choice, p: answer?.probabilities?.[choice] ?? 0 };
};

export const withRecognised = (scene: Scene, known: { readonly label: string; readonly p: number } | null): Scene =>
  known === null ? scene : { ...scene, holding: known.label, confidence: { ...scene.confidence, holding: known.p } };

export const sceneOf = (raw: unknown, at: number): Scene | null => {
  const answers = record(record(raw).answers) as Record<string, Answer>;

  if (answers.holding === undefined) return null;

  const holding = choiceOf(answers.holding, 'nothing in particular');
  const mood = choiceOf(answers.mood, 'no face');
  const gesture = choiceOf(answers.gesture, 'none');
  const place = choiceOf(answers.place, 'other');

  return {
    at,
    person: answers.person?.noul ?? 0,
    holding: holding.choice,
    mood: mood.choice,
    gesture: gesture.choice,
    place: place.choice,
    confidence: { holding: holding.p, mood: mood.p, gesture: gesture.p, place: place.p },
  };
};

const sure = (scene: Scene, key: string) => (scene.confidence[key] ?? 0) >= SIGHT_MIN_CONFIDENCE;

export const describeScene = (scene: Scene): string => {
  const parts: string[] = [];

  parts.push(scene.person >= 0.5 ? 'a person is in view' : 'no person is in view');

  if (sure(scene, 'holding') && scene.holding !== 'nothing in particular') parts.push(`they are showing ${scene.holding}`);


  if (scene.person >= 0.5 && sure(scene, 'mood') && scene.mood !== 'no face') parts.push(`they look ${scene.mood}`);

  if (sure(scene, 'gesture') && scene.gesture !== 'none') parts.push(`they are making a ${scene.gesture} gesture`);

  if (sure(scene, 'place')) parts.push(`the setting looks like ${scene.place}`);

  return parts.join('; ');
};

export const sceneKey = (scene: Scene) =>
  [scene.person >= 0.5, sure(scene, 'holding') ? scene.holding : '', sure(scene, 'mood') ? scene.mood : '', sure(scene, 'gesture') ? scene.gesture : ''].join('|');

export const sightLine = (scene: Scene | null, now: number): string | null => {
  if (scene === null || now - scene.at > SIGHT_STALE_MS) return null;

  return `Live camera, ${Math.round((now - scene.at) / 100) / 10}s ago, from a fast vision judge (may be wrong): ${describeScene(scene)}. React to it naturally when it matters. Use the look tool for detail.`;
};
