const TITLE = /<title[^>]*>([^<]*)<\/title>/iu;

const SCRIPTS_AND_STYLES = /<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/giu;

const TAGS = /<[^>]+>/gu;

const SPACE = /\s+/gu;

export const pageTitle = (html: string, fallback: string) => TITLE.exec(html)?.[1]?.trim() || fallback;

export const pageText = (html: string, limit: number) => html.replace(SCRIPTS_AND_STYLES, ' ').replace(TAGS, ' ').replace(SPACE, ' ').trim().slice(0, limit);
