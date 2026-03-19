WebSocket-first bridge between the Vibe Games editor and external tooling.
TypeScript, Zod, Biome, Vitest, esbuild, Turbo.

- /packages/core - Bridge core logic and observables
- /packages/protocol - Message protocol and schema definitions
- /packages/vscode - VS Code extension connecting to the Vibe Games editor over WebSocket
- /packages/config - Shared TypeScript/Biome config
- `pnpm validate` - Check formatting, linting, and types
- `pnpm validate:fix` - Auto-fix formatting and linting
- Types over interfaces, arrow functions, minimal comments
