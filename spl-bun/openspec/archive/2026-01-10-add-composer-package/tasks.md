## Tasks (sequential unless noted)
1. [x] Review relevant Java integration code (e.g., `com.scudata.app` namespace) to mirror composer responsibilities and identify required APIs/helpers; read `spl-bun/doc/runtime` runtime设计模式 and adopt it for external side-effect management.
2. [x] Define the composer package API surface (facade functions, adapter registration, pipeline/run helpers) and align names with Java where practical.
3. [x] Scaffold `packages/composer` with exports that wrap core engine, expression, and adapter helpers; add any minimal supporting utilities in existing packages if needed.
4. [x] Add integration tests using composer to run end-to-end pipelines (dataset load via SQLite, expressions, joins/windows) and update fixtures/docs as needed.
5. [x] Ensure workspace scripts include the new package; run `bun test` and `bun run build` across packages.
6. [x] Validate OpenSpec change: `openspec validate add-composer-package --strict`.
