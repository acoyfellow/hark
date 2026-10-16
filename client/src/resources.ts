import { type Cause, Duration, Effect, Option, Queue, Schema, Stream } from 'effect';
import { ManagedResource, Subscription } from 'foldkit';
import { type Engine, startCamera, startEngine, stopCamera } from './engine';
import { Message } from './message';
import type { Model } from './model';

type Events = Queue.Queue<Message, Cause.Done>;

type Line = { readonly engine: Engine; readonly events: Events };

export const VoiceLine = ManagedResource.tag<Line>()('VoiceLine');

const CameraFeed = ManagedResource.tag<MediaStream>()('CameraFeed');

export type Resources =
  | ManagedResource.ServiceOf<typeof VoiceLine>
  | ManagedResource.ServiceOf<typeof CameraFeed>;

class LineFailed extends Schema.TaggedError<LineFailed>()('LineFailed', {
  reason: Schema.String,
}) {}

const reasonOf = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

const openLine = (camera: boolean) =>
  Effect.gen(function* () {
    const events = yield* Queue.unbounded<Message, Cause.Done>();
    const engine = yield* Effect.tryPromise({
      try: () =>
        startEngine(
          {
            frame: (frame) => Queue.offerUnsafe(events, Message.ReceivedFrame({ frame })),
            closed: (code, reason) => {
              Queue.offerUnsafe(events, Message.LostLine({ code, reason }));
              Queue.endUnsafe(events);
            },
          },
          camera,
        ),
      catch: (cause) => new LineFailed({ reason: reasonOf(cause) }),
    });

    return { engine, events };
  });

export const managedResources = ManagedResource.make<Model, Message>()((entry) => ({
  voiceLine: entry(Schema.Option(Schema.Struct({ epoch: Schema.Number })), {
    resource: VoiceLine,
    modelToMaybeRequirements: (model) =>
      model.awake ? Option.some({ epoch: model.epoch }) : Option.none(),
    acquire: () => openLine(false),
    release: ({ engine }) => Effect.promise(() => engine.stop()),
    onAcquired: () => Message.StartedEngine(),
    onReleased: () => Message.StoppedEngine(),
    onAcquireError: (error) =>
      Message.FailedEngine({ reason: error instanceof LineFailed ? error.reason : reasonOf(error) }),
  }),
  cameraFeed: entry(Schema.Option(Schema.Struct({ on: Schema.Boolean })), {
    resource: CameraFeed,
    modelToMaybeRequirements: (model) => (model.camera ? Option.some({ on: true }) : Option.none()),
    acquire: () =>
      Effect.tryPromise({
        try: () => startCamera(),
        catch: (cause) => new LineFailed({ reason: reasonOf(cause) }),
      }),
    release: (stream) => Effect.sync(() => stopCamera(stream)),
    onAcquired: () => Message.StartedCamera(),
    onReleased: () => Message.StoppedCamera(),
    onAcquireError: (error) =>
      Message.FailedCamera({
        reason: `The camera did not start: ${error instanceof LineFailed ? error.reason : reasonOf(error)}`,
      }),
  }),
}));

const TICK = Duration.seconds(1);

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

const isButton = (target: EventTarget | null) => target instanceof HTMLElement && target.tagName === 'BUTTON';

const isCommandK = (event: KeyboardEvent) => (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';

const sheetOpen = () => document.querySelector('[data-sheet-open="true"]') !== null;

const commandKeys: Stream.Stream<Message> = Stream.fromEventListener<KeyboardEvent>(document, 'keydown').pipe(
  Stream.filter((event) => isCommandK(event) || (sheetOpen() && (event.key === 'ArrowDown' || event.key === 'ArrowUp') && !isTyping(event.target))),
  Stream.map((event): Message => {
    event.preventDefault();

    return isCommandK(event) ? Message.PressedCommandK() : Message.SteppedTab({ by: event.key === 'ArrowDown' ? 1 : -1 });
  }),
);

const plainKeys: Stream.Stream<Message> = Stream.fromEventListener<KeyboardEvent>(document, 'keydown').pipe(
  Stream.filter((event) => !event.repeat && (event.key === 'Escape' || !isTyping(event.target))),
  Stream.filter((event) => event.key === 'Escape' || (event.code === 'Space' && !isButton(event.target) && !sheetOpen())),
  Stream.map((event): Message => {
    if (event.key === 'Escape') return Message.PressedEscape();

    event.preventDefault();

    return Message.PressedSpace();
  }),
);

export const subscriptions = Subscription.make<Model, Message, Resources>()((entry) => ({
  line: entry(
    { connected: Schema.Boolean, epoch: Schema.Number },
    {
      modelToDependencies: (model) => ({ connected: model.connected, epoch: model.epoch }),
      dependenciesToStream: ({ connected }) =>
        connected
          ? Stream.unwrap(
              VoiceLine.get.pipe(
                Effect.map(({ events }) => Stream.fromQueue(events)),
                Effect.catchTag('ResourceNotAvailable', () => Effect.succeed(Stream.empty)),
              ),
            )
          : Stream.empty,
    },
  ),
  clock: entry(
    { ticking: Schema.Boolean },
    {
      modelToDependencies: (model) => ({
        ticking: model.visuals.some((visual) => visual._tag === 'Timer'),
      }),
      dependenciesToStream: ({ ticking }) =>
        ticking
          ? Stream.tick(TICK).pipe(
              Stream.mapEffect(() => Effect.clockWith((clock) => clock.currentTimeMillis)),
              Stream.map((now) => Message.Ticked({ now })),
            )
          : Stream.empty,
    },
  ),
  keys: entry({ on: Schema.Boolean }, { modelToDependencies: () => ({ on: true }), dependenciesToStream: () => Stream.merge(plainKeys, commandKeys) }),
}));
