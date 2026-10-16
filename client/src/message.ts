import { Schema } from 'effect';
import { defineMessageUnion } from 'foldkit/message';
import { Brain, ServerFrame, SpeechEngine, Voice } from '../../shared/protocol';
import { PushState, SettingsTab } from './model';

export const Message = defineMessageUnion({
  ClickedOrb: {},
  PressedSpace: {},
  PressedEscape: {},
  ClickedCamera: {},
  ClickedSheet: {},
  ClosedSheet: {},
  PressedCommandK: {},
  PickedTab: { tab: SettingsTab },
  SteppedTab: { by: Schema.Number },
  TypedQuery: { query: Schema.String },
  TypedServerUrl: { url: Schema.String },
  TypedServerToken: { token: Schema.String },
  SubmittedServer: {},
  ClickedRemoveServer: { id: Schema.String },
  ClickedEnablePush: {},
  ChangedPush: { push: PushState },
  PickedVoice: { voice: Voice },
  PickedBrain: { brain: Brain },
  PickedEngine: { engine: SpeechEngine },
  ClickedSignOut: {},
  DismissedVisual: { id: Schema.String },
  DismissedFault: {},
  StartedEngine: {},
  FailedEngine: { reason: Schema.String },
  StoppedEngine: {},
  ReceivedFrame: { frame: ServerFrame },
  LostLine: { code: Schema.Number, reason: Schema.String },
  StartedCamera: {},
  FailedCamera: { reason: Schema.String },
  StoppedCamera: {},
  Ticked: { now: Schema.Number },
  CompletedSend: {},
  CompletedSignOut: {},
  CompletedMount: {},
});

export type Message = typeof Message.Type;
