const FIRST_MIN_CHARS = 18;

const NEXT_MIN_CHARS = 48;

const HARD_MAX_CHARS = 260;

const END = /[.!?…]["')\]]?(?=\s)|[\n]/gu;

const SOFT = /[,;:—–](?=\s)/gu;

const ACRONYM = /(?<![\p{L}\p{N}_])(DDoS|\p{Lu}{2,5})(s)?(?![\p{L}\p{N}_])/gu;

export const speakable = (text: string): string =>
  text
    .replace(/```[\s\S]*?```/gu, ' ')
    .replace(/`([^`]*)`/gu, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, '$1')
    .replace(/https?:\/\/\S+/gu, ' ')
    .replace(/^\s{0,3}#{1,6}\s+/gmu, '')
    .replace(/^\s*[-*•]\s+/gmu, '')
    .replace(/^\s*\d+[.)]\s+/gmu, '')
    .replace(/(\*\*|__|\*|_|~~)(?=\S)([^*_~]+?)\1/gu, '$2')
    .replace(/<\/?[a-z][^>]*>/giu, ' ')
    .replace(/[*#>|]/gu, ' ')
    .replace(/["\u201c\u201d]/gu, '')
    .replace(/\s*(?:--+|\u2014)\s*/gu, '... ')
    .replace(ACRONYM, (_match: string, acronym: string, plural: string | undefined) => {
      const letters = acronym === 'AI' ? 'A.I.' : [...acronym.toUpperCase()].join(' ');

      return plural === undefined ? letters : `${letters}'s`;
    })
    .replace(/\s+([,.!?])/gu, '$1')
    .replace(/\s+/gu, ' ')
    .trim();

const lastMatchEnd = (pattern: RegExp, text: string, from: number): number => {
  let end = -1;

  for (const match of text.matchAll(pattern)) {
    const at = match.index + match[0].length;

    if (at >= from) end = at;
  }

  return end;
};

const cutPoint = (buffer: string, first: boolean): number => {
  const min = first ? FIRST_MIN_CHARS : NEXT_MIN_CHARS;
  const sentence = lastMatchEnd(END, buffer, min);

  if (sentence > 0) return sentence;

  if (first) {
    const soft = lastMatchEnd(SOFT, buffer, min + 12);

    if (soft > 0) return soft;
  }

  if (buffer.length < HARD_MAX_CHARS) return -1;

  const space = buffer.lastIndexOf(' ', HARD_MAX_CHARS);

  return space > min ? space : HARD_MAX_CHARS;
};

export type Chunker = {
  readonly push: (delta: string) => readonly string[];
  readonly flush: () => readonly string[];
};

export const chunker = (): Chunker => {
  let buffer = '';
  let spoken = 0;

  const take = (end: number): string[] => {
    const piece = speakable(buffer.slice(0, end));

    buffer = buffer.slice(end);

    if (piece === '') return [];

    spoken += 1;

    return [piece];
  };

  return {
    push: (delta) => {
      buffer += delta;

      const out: string[] = [];

      for (;;) {
        const end = cutPoint(buffer, spoken === 0);

        if (end <= 0) return out;

        out.push(...take(end));
      }
    },
    flush: () => take(buffer.length),
  };
};

const words = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .split(/\s+/u)
    .filter((word) => word !== '')
    .join(' ');

export const sameWords = (a: string, b: string): boolean => words(a) === words(b);
