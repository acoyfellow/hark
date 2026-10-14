import { Schema } from 'effect';
import { defineMessageUnion } from 'foldkit/message';
import { Brain, ServerFrame, Voice } from '../../shared/protocol';

export const Message = defineMessageUnion({
  ClickedOrb: {},
  PressedSpace: {},
  PressedEscape: {},
  ClickedCamera: {},
  ClickedSheet: {},
  ClosedSheet: {},
  PickedVoice: { voice: Voice },
  PickedBrain: { brain: Brain },
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
