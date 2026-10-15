import type { Upstream } from './upstream';

export type AiLike = {
  run(model: string, input: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
};

export class UnsupportedModel extends Error {}

export const userAI = (upstream: () => Upstream): AiLike => ({
  run: async (model, input, options) => {
    if (model === '@cf/deepgram/flux' && options?.websocket === true) return { webSocket: await upstream().listen(input) };

    throw new UnsupportedModel(`hark's user AI adapter does not route ${model}`);
  },
});
