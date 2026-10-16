export type WebResult = { readonly title: string; readonly url: string; readonly note: string };

const RESULT_LINK = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/giu;

const RESULT_SNIPPET = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/giu;

const TAGS = /<[^>]+>/gu;

const ENTITIES: Record<string, string> = { '&amp;': '&', '&quot;': '"', '&#x27;': "'", '&#39;': "'", '&lt;': '<', '&gt;': '>', '&nbsp;': ' ' };

const ENTITY = /&(?:amp|quot|#x27|#39|lt|gt|nbsp);/gu;

const clean = (html: string) => html.replace(TAGS, '').replace(ENTITY, (entity) => ENTITIES[entity] ?? entity).trim();

const realUrl = (href: string) => {
  try {
    const url = new URL(href.startsWith('//') ? `https:${href}` : href);
    const target = url.searchParams.get('uddg');

    return target ?? url.toString();
  } catch {
    return null;
  }
};

export const searchCommand = (query: string) => `curl -sL --max-time 15 -A 'Mozilla/5.0' --data-urlencode ${JSON.stringify(`q=${query}`)} https://html.duckduckgo.com/html/`;

export const parseResults = (html: string, limit: number): WebResult[] => {
  const snippets = [...html.matchAll(RESULT_SNIPPET)].map((match) => clean(match[1] ?? ''));

  return [...html.matchAll(RESULT_LINK)]
    .flatMap((match, index) => {
      const url = realUrl(clean(match[1] ?? ''));

      return url === null ? [] : [{ title: clean(match[2] ?? ''), url, note: snippets[index] ?? '' }];
    })
    .slice(0, limit);
};
