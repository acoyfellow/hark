import { Schema } from 'effect';
import { Latency, McpServer, Panel, Presence, Settings, Visual, Beat } from '../../shared/protocol';

export const Look = Schema.Union([Schema.Literal('asleep'), Presence]);

export type Look = typeof Look.Type;

export const WorkspaceEntry = Schema.Struct({ path: Schema.String, type: Schema.Literals(['file', 'dir']) });

export type WorkspaceEntry = typeof WorkspaceEntry.Type;

const Workspace = Schema.Struct({
  open: Schema.Boolean,
  tree: Schema.Array(WorkspaceEntry),
  file: Schema.Option(Schema.Struct({ path: Schema.String, text: Schema.String })),
  loading: Schema.Boolean,
});

export const SettingsTab = Schema.Literals(['account', 'voice', 'brain', 'tools']);

export type SettingsTab = typeof SettingsTab.Type;

export const PushState = Schema.Literals(['unsupported', 'default', 'granted', 'denied']);

export type PushState = typeof PushState.Type;

const ServerDraft = Schema.Struct({ url: Schema.String, token: Schema.String, pending: Schema.Boolean, note: Schema.Option(Schema.String), authUrl: Schema.Option(Schema.String) });


export const Model = Schema.Struct({
  local: Schema.Boolean,
  awake: Schema.Boolean,
  epoch: Schema.Number,
  connected: Schema.Boolean,
  look: Look,
  account: Schema.Option(Schema.String),
  memories: Schema.Number,
  settings: Schema.Option(Settings),
  doing: Schema.Option(Schema.String),
  visuals: Schema.Array(Visual),
  panels: Schema.Array(Panel),
  drawer: Schema.Boolean,
  instructions: Schema.String,
  instructionsDraft: Schema.Option(Schema.String),
  latency: Schema.Option(Latency),
  fault: Schema.Option(Schema.String),
  note: Schema.Option(Schema.String),
  camera: Schema.Boolean,
  cameraLive: Schema.Boolean,
  idle: Schema.Array(Beat),
  sheet: Schema.Boolean,
  tab: SettingsTab,
  query: Schema.String,
  servers: Schema.Array(McpServer),
  draft: ServerDraft,
  push: PushState,
  workspace: Workspace,
  now: Schema.Number,
});

export type Model = typeof Model.Type;

export const MAX_VISUALS = 4;
