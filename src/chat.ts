export type Part =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'image_url'; readonly image_url: { readonly url: string } };

export type ChatMessage =
  | { readonly role: 'system' | 'user'; readonly content: string | readonly Part[] }
  | {
      readonly role: 'assistant';
      readonly content: string | null;
      readonly tool_calls?: ReadonlyArray<{
        readonly id: string;
        readonly type: 'function';
        readonly function: { readonly name: string; readonly arguments: string };
      }>;
    }
  | { readonly role: 'tool'; readonly tool_call_id: string; readonly content: string };
