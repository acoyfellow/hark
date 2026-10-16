const block = (event: Event) => event.preventDefault();

const isPinch = (event: TouchEvent) => event.touches.length > 1;

export const holdStill = (target: Document = document) => {
  const options: AddEventListenerOptions = { passive: false };

  target.addEventListener('gesturestart', block, options);
  target.addEventListener('gesturechange', block, options);
  target.addEventListener('dblclick', block, options);
  target.addEventListener('touchmove', (event) => (isPinch(event as TouchEvent) ? block(event) : undefined), options);
};
