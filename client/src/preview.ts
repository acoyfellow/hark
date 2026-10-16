import { Effect } from 'effect';
import { Mount } from 'foldkit';
import { currentCamera } from './engine';
import { Message } from './message';

export const Preview = Mount.define('Preview', {
  messages: [Message.CompletedMount],
  execute: ({ element }) =>
    Effect.sync(() => {
      if (element instanceof HTMLVideoElement) {
        element.srcObject = currentCamera();
        void element.play().catch(() => undefined);
      }

      return Message.CompletedMount();
    }),
});
