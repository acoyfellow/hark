import { startSwarm } from './swarm';

type DemoBeat = { readonly kind: string; readonly value: string; readonly seconds: number; readonly motion: string };

const ROCKET = JSON.stringify([
  { shape: 'cylinder', at: [0, 0, 0], size: [0.22, 0.7, 0.22] },
  { shape: 'cone', at: [0, 0.95, 0], size: [0.22, 0.28, 0.22] },
  { shape: 'box', at: [0.3, -0.6, 0], size: [0.1, 0.18, 0.03] },
  { shape: 'box', at: [-0.3, -0.6, 0], size: [0.1, 0.18, 0.03] },
  { shape: 'sphere', at: [0, 0.25, 0.2], size: [0.08, 0.08, 0.04], glow: 1 },
  { shape: 'cone', at: [0, -0.95, 0], size: [0.16, -0.3, 0.16], glow: 1 },
]);

const SCENES: readonly (readonly DemoBeat[])[] = [
  [{ kind: 'model', value: ROCKET, seconds: 5, motion: 'spin' }],
  [{ kind: 'emoji', value: '❤️', seconds: 4, motion: 'pulse' }],
  [{ kind: 'solid', value: 'torus', seconds: 4, motion: 'spin' }],
  [{ kind: 'word', value: 'hark', seconds: 4, motion: 'pulse' }],
];

const SCENE_GAP_MS = 4200;

const playScenes = (host: HTMLElement) => {
  let index = 0;

  const next = () => {
    const scene = SCENES[index % SCENES.length]!;
    const seconds = scene.reduce((total, beat) => total + beat.seconds, 0);

    host.dataset.formBeats = JSON.stringify(scene);
    host.dataset.formId = `welcome-${index}`;
    index += 1;
    setTimeout(next, seconds * 1000 + SCENE_GAP_MS);
  };

  setTimeout(next, 1800);
};

const host = document.getElementById('welcome-swarm');

if (host !== null && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  try {
    startSwarm(host);
    host.dataset.swarm = 'live';
    playScenes(host);
  } catch {
    host.dataset.swarm = 'unavailable';
  }
}
