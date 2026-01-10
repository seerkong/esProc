# SPL Bun workspace

This workspace hosts a TypeScript reimplementation of the esProc core engine with an initial SQLite adapter. Bun is required.

## Setup
- Install Bun (https://bun.sh)
- Install deps: `bun install`

## Scripts
- `bun test` — run all workspace tests (core + sqlite adapter + fixtures)
- `bun run build` — build all packages

Notes: TypeScript only; linting is deferred for v1. Naming and directory structure aim to stay close to the original esProc sources where practical.