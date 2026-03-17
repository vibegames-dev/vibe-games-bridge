# Vibe Games Bridge

Monorepo scaffold for a WebSocket-first bridge between the Vibe Games editor and external tooling.

## Workspace

- `packages/config`: shared TypeScript presets
- `packages/protocol`: shared message, resource, and error definitions
- `packages/host`: host/server primitives that embedding apps compose
- `packages/vscode`: VS Code-facing client and workspace bridge shell
- `docs`: protocol, security, and local development notes

## Tooling

- `pnpm` workspaces
- `turbo` task orchestration
- `biome` formatting and linting
- shared TypeScript config package
