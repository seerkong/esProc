## 1. Implementation
- [ ] 1.1 Rework `packages/web-ide` UI to two stacked tables: editable HTML/CSS grid with A/B/C columns (Excel-like) and a separate results table (AG Grid allowed for multi-row outputs); ensure cells are clickable/editable.
- [ ] 1.2 Port esProc SPL DSL parser/execution helpers into new `packages/spl-dsl` (Command/ParamParser/KeyWord/CellRef) with unit tests.
- [ ] 1.3 Wire web-ide runtime to `@esproc/spl-dsl` + expression/DataSet engine via runtime设计模式 (explicit adapters/logger; no implicit DI); ensure front-end only uses DSL/expression, not sqlite adapter unless explicitly injected.
- [ ] 1.4 Update docs in `spl-bun/doc` and add integration tests covering vertical layout + DSL execution path; adjust root `web-ide:dev` to serve new flow.
