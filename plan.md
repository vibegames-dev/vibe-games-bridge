# Vibe Games Bridge

## Overview

Build a new open source repo named `vibe-games-bridge`.

This repo should provide a reusable bridge between the Vibe Games editor and external tooling, starting with VS Code. The bridge must support scripts, materials, console logs, AI tooling, commands, diagnostics, scene control, and future editor capabilities over a single real-time connection.

The bridge is not just a VS Code extension. It is a small platform made of:

- a shared protocol package
- a host/server package that apps embed
- a VS Code extension package that mounts the editor as a virtual workspace

The architecture must be **WebSocket-first**. Do not add REST or RPC routes for file CRUD. All file operations, events, logs, and commands should go through one typed WebSocket protocol.

## Goals

- Open a Vibe Games project in local VS Code from the browser with one click
- Expose editor-managed resources as a virtual workspace in VS Code
- Keep the bridge generic enough to reuse outside scripts-only workflows
- Make the protocol reusable by future clients beyond VS Code
- Support real-time bidirectional sync between the web editor and VS Code
- Keep app integration thin: the host app implements adapters, the bridge repo handles transport and tooling behavior

## Non-Goals

- Do not embed full VS Code in the browser
- Do not require real filesystem materialization on the host app
- Do not make HTTP CRUD routes the primary data interface
- Do not couple the bridge to Vibe Games internals like Zustand or specific database schemas

## Product Shape

The repo should be named:

- `vibe-games-bridge`

Suggested package names:

- `@vibe-games-bridge/protocol`
- `@vibe-games-bridge/host`
- `@vibe-games-bridge/vscode`

Suggested VS Code extension id:

- `vibe-games-bridge.vscode`

Suggested virtual filesystem scheme:

- `vibe-games`

Suggested URI handler shape:

- `vscode://vibe-games-bridge.vscode/open?projectId=abc&workspace=My%20Project&serverUrl=wss%3A%2F%2Fexample.com%2Fbridge&token=...`

## High-Level Architecture

```text
┌────────────────────┐       WebSocket        ┌────────────────────┐
│ Vibe Games Editor  │◄──────────────────────►│  Bridge Host       │
│ Browser App        │                        │  (@.../host)       │
│ Zustand / project  │                        │  protocol hub      │
└────────────────────┘                        └────────────────────┘
                                                       ▲
                                                       │ WebSocket
                                                       ▼
                                            ┌────────────────────┐
                                            │ VS Code Extension  │
                                            │ (@.../vscode)      │
                                            │ FileSystemProvider │
                                            └────────────────────┘
```

The host app embeds the host package and provides adapters. The VS Code extension connects to the host over WebSocket and exposes the project as a virtual workspace.

## Core Design Rules

- One WebSocket connection per client session
- Typed request/response protocol with `requestId`
- Broadcast change events to all subscribed clients
- Resource model must support more than files
- The protocol must be transport-agnostic at the type level, even if the first implementation uses WebSocket
- The VS Code extension must work with local desktop VS Code first
- URI-based open flow must be supported from the web app
- Authentication must be token-based and short-lived

## Resource Model

The bridge should not model only scripts. It should model editor resources.

Suggested initial resource kinds:

- `script`
- `material`
- `scene`
- `config`
- `log`
- `diagnostic`
- `ai-thread`

Initial workspace-facing paths:

```text
vibe-games:/<projectId>/
  scripts/
    playerController.ts
    enemyAi.ts
  materials/
    terrain.json
    sky.json
  scenes/
    main.scene.json
  logs/
    runtime.log
  diagnostics/
    scripts.json
```

Notes:

- `scripts/` and `materials/` should be editable from day one
- `scenes/` can start read-only if needed
- `logs/` and `diagnostics/` do not need full write support
- AI features do not need to appear as normal files if commands or panels fit better

## Repo Structure

```text
vibe-games-bridge/
  packages/
    config/
      tsconfig.base.json
      tsconfig.react.json
    protocol/
      src/
        messages.ts
        resources.ts
        errors.ts
        index.ts
    host/
      src/
        createBridgeServer.ts
        createConnectionManager.ts
        createRequestRouter.ts
        createBroadcastHub.ts
        types.ts
        auth.ts
        index.ts
    vscode/
      src/
        extension.ts
        uriHandler.ts
        wsClient.ts
        fileSystemProvider.ts
        diagnosticsProvider.ts
        outputChannelBridge.ts
        commands.ts
        workspaceState.ts
        index.ts
      package.json
  docs/
    protocol.md
    security.md
    development.md
  package.json
  pnpm-workspace.yaml
  tsconfig.json
```

## Package Responsibilities

### `@vibe-games-bridge/protocol`

Owns:

- all message types
- shared enums and discriminated unions
- request and event payload schemas
- error codes
- resource descriptors

Rules:

- no runtime dependency on VS Code APIs
- no host-app-specific logic
- use Zod or a similar schema layer for runtime validation

### `@vibe-games-bridge/host`

Owns:

- WebSocket session lifecycle
- authentication handshake
- project subscription and room membership
- request routing
- change broadcasts
- adapter interfaces the host app implements

Rules:

- the host package does not know about Zustand, React, or database details
- it should accept resource adapters and command handlers from the embedding app
- it should expose a minimal API for the host app to push local changes into the bridge

### `@vibe-games-bridge/vscode`

Owns:

- VS Code activation
- URI handler
- WebSocket client
- `FileSystemProvider`
- command registration
- output/log integration
- diagnostics wiring

Rules:

- the extension must not contain Vibe Games business logic beyond workspace presentation
- the extension must map bridge resources to idiomatic VS Code concepts

## Host Adapter API

The host app should implement a generic adapter surface, not script-specific methods only.

Suggested shape:

```ts
export type BridgeResourceKind =
  | "script"
  | "material"
  | "scene"
  | "config"
  | "log"
  | "diagnostic";

export type BridgeEntry = {
  id: string;
  kind: BridgeResourceKind;
  path: string;
  name: string;
  language?: string;
  readOnly?: boolean;
  size?: number;
  updatedAt?: string;
};

export type BridgeFileContent = {
  entry: BridgeEntry;
  content: string;
  version: string;
};

export type BridgeHostAdapter = {
  listEntries: () => Promise<BridgeEntry[]>;
  readEntry: (path: string) => Promise<BridgeFileContent>;
  writeEntry: (
    path: string,
    content: string,
    version?: string,
  ) => Promise<{ version: string }>;
  createEntry: (path: string, content?: string) => Promise<BridgeFileContent>;
  deleteEntry: (path: string) => Promise<void>;
  renameEntry: (oldPath: string, newPath: string) => Promise<void>;
};
```

Optional adapters can be separate:

- diagnostics adapter
- logs adapter
- commands adapter
- AI adapter

## WebSocket Protocol

Use a discriminated union with `type` and `requestId` where applicable.

### Connection Handshake

Client sends:

```ts
type ClientHello = {
  type: "session:hello";
  requestId: string;
  protocolVersion: 1;
  client: {
    kind: "editor" | "vscode";
    name: string;
    version: string;
  };
  auth: {
    token: string;
  };
  workspace: {
    projectId: string;
  };
};
```

Server responds:

```ts
type ServerHello = {
  type: "session:ready";
  requestId: string;
  sessionId: string;
  capabilities: {
    resourceKinds: BridgeResourceKind[];
    supportsWatch: boolean;
    supportsCommands: boolean;
    supportsDiagnostics: boolean;
    supportsAi: boolean;
  };
};
```

### Resource Requests

Client requests:

```ts
type ResourceListRequest = {
  type: "resource:list";
  requestId: string;
};

type ResourceReadRequest = {
  type: "resource:read";
  requestId: string;
  path: string;
};

type ResourceWriteRequest = {
  type: "resource:write";
  requestId: string;
  path: string;
  content: string;
  version?: string;
};

type ResourceCreateRequest = {
  type: "resource:create";
  requestId: string;
  path: string;
  content?: string;
};

type ResourceDeleteRequest = {
  type: "resource:delete";
  requestId: string;
  path: string;
};

type ResourceRenameRequest = {
  type: "resource:rename";
  requestId: string;
  oldPath: string;
  newPath: string;
};
```

Server responses:

```ts
type ResourceListResponse = {
  type: "resource:list:result";
  requestId: string;
  entries: BridgeEntry[];
};

type ResourceReadResponse = {
  type: "resource:read:result";
  requestId: string;
  file: BridgeFileContent;
};

type ResourceWriteResponse = {
  type: "resource:write:result";
  requestId: string;
  version: string;
};

type ResourceCreateResponse = {
  type: "resource:create:result";
  requestId: string;
  file: BridgeFileContent;
};

type ResourceDeleteResponse = {
  type: "resource:delete:result";
  requestId: string;
};

type ResourceRenameResponse = {
  type: "resource:rename:result";
  requestId: string;
};
```

### Broadcast Events

Server broadcasts:

```ts
type ResourceChangedEvent = {
  type: "event:resourceChanged";
  path: string;
  kind: "created" | "updated" | "deleted" | "renamed";
  oldPath?: string;
  entry?: BridgeEntry;
  version?: string;
};

type LogEvent = {
  type: "event:log";
  level: "debug" | "info" | "warn" | "error";
  channel: string;
  message: string;
  timestamp: string;
};

type DiagnosticsEvent = {
  type: "event:diagnostics";
  path: string;
  diagnostics: {
    severity: "error" | "warning" | "info" | "hint";
    message: string;
    line: number;
    column: number;
    endLine?: number;
    endColumn?: number;
    source?: string;
    code?: string;
  }[];
};

type CommandEvent = {
  type: "event:command";
  command: string;
  payload?: unknown;
};
```

### Errors

All request failures should return a typed error:

```ts
type ErrorResponse = {
  type: "error";
  requestId: string;
  code:
    | "unauthorized"
    | "forbidden"
    | "notFound"
    | "conflict"
    | "invalidRequest"
    | "unsupported"
    | "internal";
  message: string;
};
```

## VS Code Extension Behavior

### Activation

The extension should activate on:

- `onStartupFinished`
- `onUri`
- the custom commands it contributes

Core commands:

- `vibeGamesBridge.open`
- `vibeGamesBridge.connect`
- `vibeGamesBridge.refresh`
- `vibeGamesBridge.revealLogs`
- `vibeGamesBridge.runScene`
- `vibeGamesBridge.stopScene`

### URI Handler

The browser app should generate a `vscode://` URL that:

- opens local VS Code
- activates the extension
- passes `projectId`
- passes `serverUrl`
- passes a short-lived token
- optionally passes a human-readable workspace name

The URI handler should:

- validate parameters
- establish a WebSocket connection
- create or reuse a virtual workspace root
- refresh the explorer view
- surface useful errors to the user

### FileSystemProvider

Map bridge resources to the VS Code filesystem APIs.

Minimum methods to implement:

- `stat`
- `readDirectory`
- `readFile`
- `writeFile`
- `createDirectory`
- `delete`
- `rename`
- `watch`

Behavior rules:

- `scripts/` and `materials/` must appear as normal files
- read-only resources should set proper file permissions
- `watch` should hook into bridge change events
- external changes from the editor must call `onDidChangeFile`
- version conflicts should be surfaced clearly

### Logs and Diagnostics

Logs:

- use a dedicated `OutputChannel`
- stream `event:log` messages live
- allow filtering by channel if practical

Diagnostics:

- map `event:diagnostics` to `DiagnosticCollection`
- clear diagnostics when a file disappears or when empty arrays arrive

## Host Package Behavior

The host package should expose something like:

```ts
export const createBridgeServer = (options: {
  authenticate: (token: string, projectId: string) => Promise<{ userId?: string }>;
  adapter: BridgeHostAdapter;
}) => {
  return {
    handleWebSocket: (socket: WebSocket, request: Request) => void,
    broadcastResourceChanged: (event: ResourceChangedEvent) => void,
    broadcastLog: (event: LogEvent) => void,
    broadcastDiagnostics: (event: DiagnosticsEvent) => void,
    broadcastCommand: (event: CommandEvent) => void,
  };
};
```

Expected behavior:

- validate incoming messages against protocol schemas
- reject unauthenticated clients before resource access
- isolate sessions by project
- broadcast only to clients subscribed to the same project
- clean up pending requests and watchers on disconnect

## Vibe Games App Integration

The bridge repo should stay generic, but the first consumer is Vibe Games.

The Vibe Games app should be responsible for:

- creating short-lived bridge tokens
- creating the WebSocket endpoint
- implementing the host adapter against project state
- publishing local editor changes into the bridge
- generating the `vscode://` open URL in the editor UI

The app integration should remain thin. The app should not reimplement protocol handling or VS Code-specific behavior.

Suggested Vibe Games adapter mapping:

- `scripts/*.ts` or `scripts/*.js` map to project scripts
- `materials/*.json` map to material definitions
- `scenes/*.scene.json` map to scenes
- console logs map to output events
- AI tools map to commands and future custom views

## Authentication

Requirements:

- tokens must be short-lived
- tokens must be scoped to a single project
- tokens should be single-use if practical
- the WebSocket server must reject expired or malformed tokens

Recommended flow:

1. User clicks `Open in VS Code` in the browser editor
2. The app generates a bridge token for that project
3. The app opens a `vscode://...` URI containing `projectId`, `serverUrl`, and the token
4. VS Code opens, the extension connects, and the host validates the token

Avoid:

- long-lived static API keys
- embedding user session cookies into the extension flow
- using the query string token for anything beyond the initial handshake

## Phase Plan

### Phase 1: Minimal End-to-End

Deliver:

- protocol package with validated request/response types
- host package with auth, list/read/write/create/delete/rename
- VS Code extension with URI handler and `FileSystemProvider`
- support for editable `scripts/`
- support for change broadcasts from host to VS Code

Acceptance criteria:

- user can click `Open in VS Code` from the browser app
- local VS Code opens and shows the project scripts
- editing a script in VS Code writes back through the WebSocket bridge
- editing the same script in the browser updates the VS Code explorer/editor state

### Phase 2: Materials, Logs, Diagnostics

Deliver:

- editable `materials/`
- log streaming into an output channel
- diagnostics streaming into Problems panel

Acceptance criteria:

- material edits round-trip correctly
- runtime/editor logs stream live
- server-side or app-side validation errors surface as VS Code diagnostics

### Phase 3: Commands and Scene Control

Deliver:

- command channel
- run/stop scene commands
- reveal object or asset from VS Code back in the editor

Acceptance criteria:

- extension command palette can trigger scene actions
- editor can push command events to the extension where appropriate

### Phase 4: AI and Richer Tooling

Deliver:

- AI request/response channel
- richer workspace metadata
- optional custom tree views or panels in the extension

Acceptance criteria:

- AI interactions do not distort the core filesystem model
- protocol remains backwards-compatible

## File Mapping Rules

Use stable virtual paths. Paths are part of the protocol contract.

Rules:

- paths must be unique within a project
- paths should be human-readable
- renames should preserve identity via `id` while changing `path`
- the extension should prefer path-based filesystem operations, not opaque ids
- the host adapter may internally resolve path to id

Example mappings:

- script id `abc123` -> `scripts/playerController.ts`
- material id `mat_01` -> `materials/terrain.json`

## Conflict Handling

The protocol should include lightweight versioning on writable resources.

Rules:

- `read` returns a `version`
- `write` may include the last known `version`
- the host may reject stale writes with `conflict`
- the extension should offer reload behavior on conflicts

Start simple:

- optimistic last-write-wins is acceptable for the first pass if conflicts are surfaced cleanly

## Testing

### Protocol

- runtime validation tests for all message variants
- serialization and parsing tests
- backwards-compatibility checks for protocol version changes

### Host

- auth handshake tests
- request routing tests
- project isolation tests
- broadcast tests
- disconnect cleanup tests

### VS Code Extension

- URI parsing tests
- request/response client tests
- `FileSystemProvider` tests for list/read/write/rename/delete
- diagnostics mapping tests

### End-to-End

Use an example host app in the bridge repo.

Scenarios:

- connect from URI
- list scripts
- edit a file in VS Code
- receive external update event
- rename a file
- show logs
- show diagnostics

## Documentation to Include in the New Repo

Add:

- `README.md` with product overview and quick start
- `docs/protocol.md` with all message types
- `docs/security.md` with token and connection model
- `docs/development.md` with local dev instructions

The README should explain:

- what the bridge is
- how host apps embed it
- how the VS Code extension connects
- what resources it can expose

## Implementation Notes

- Prefer TypeScript across all packages
- Prefer discriminated unions over ad hoc message objects
- Prefer Zod schemas for runtime safety
- Keep the extension desktop-first initially
- Keep package boundaries strict so the protocol stays reusable
- Do not leak app-specific state management choices into the bridge packages

## Deliverables

The new repo should ship:

- a reusable protocol package
- a reusable host/server package
- a published VS Code extension package
- an example host app proving the integration
- docs describing the protocol and integration model

## Success Criteria

This project is successful when:

- Vibe Games can open local VS Code from the browser with one click
- scripts and materials feel like normal files in VS Code
- logs and diagnostics stream live
- the bridge remains generic enough to support more editor features later
- the host app integration stays small and does not require route-per-resource sprawl
