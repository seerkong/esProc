## Tasks (sequential unless noted)

1. [x] Define join/window scope and API shapes in core (inner/left joins; window partition/order with row_number/rank/running-sum/avg) and map to esProc naming where practical.
2. [x] Design data model implications (schema merging, null-handling, type inference) and execution semantics for join/window steps.
3. [x] Implement core dataset operators for join and window, integrating with step execution (no linting) and preserving TypeScript patterns.
4. [x] Expand tests in `packages/core` for join/window behaviors (unit-level) and add SQLite-backed integration cases via fixtures.
5. [x] Update docs/README snippets if any usage examples are needed for join/window; ensure scripts still run via `bun test` and `bun run build`.
6. [x] Validation: run `bun test` (and build if needed) in `spl-bun/` after implementation.
