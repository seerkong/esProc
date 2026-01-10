## Tasks (sequential unless noted)

1. [x] Scaffold `spl-bun/` Bun workspace with root package config, workspace settings, and shared scripts (install, test, build); commit starter README outlining package layout and TypeScript setup (no linting).
2. [x] Create `packages/core` for the SPL runtime: define dataset model, cell/step execution pipeline, basic set operations (projection/filter/aggregate only for v1), and error propagation hooks; mirror original naming/structure where practical.
3. [x] Create `packages/sqlite-adapter` that opens SQLite files/URIs, executes parameterized queries, streams rows into the core dataset abstraction, and exposes metadata/error states.
4. [x] Add integration surfaces between core and adapter (e.g., a loader/executor API) so a script can orchestrate steps that pull from SQLite and operate on results; maintain naming parity with source engine concepts.
5. [x] Build shared test utilities/fixtures (sample SQLite db, helpers) and author Bun tests covering core engine behaviors and SQLite integration paths.
6. [x] Wire root scripts (e.g., `bun test`) to execute package-level checks; document usage and TypeScript notes (no linting) in `spl-bun/README.md`.
7. [x] Validation: run `bun install` and `bun test` from `spl-bun/` to ensure workspace and packages pass.
