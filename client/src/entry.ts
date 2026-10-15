import './styles.css';
import { Runtime } from 'foldkit';
import { primeAudio } from './engine';
import { startTracing } from './trace';
import { type Flags, flags, Flags as FlagsSchema, init } from './main';
import { Message } from './message';
import { Model } from './model';
import { managedResources, type Resources, subscriptions } from './resources';
import { update } from './update';
import { view } from './view';

startTracing();

for (const event of ['pointerdown', 'keydown'])
  addEventListener(event, primeAudio, { capture: true, passive: true });

const application = Runtime.makeApplication<Model, Message, Flags, never, Resources>({
  Model,
  Flags: FlagsSchema,
  init,
  update,
  view,
  subscriptions,
  managedResources,
  container: document.getElementById('root'),
  devTools: { Message },
});

Runtime.run(application, { flags });
