# SPL Bun Web IDE (grid) tech selection — AG Grid Enterprise

## Context
- Goal: build a web-IDE package in `spl-bun` for spreadsheet-like SPL authoring/execution (Excel-style grid with step-by-step results). Must be highly extensible/customizable and run in browser.
- Reference: AG Grid Enterprise integration pattern from `E:\web-dev\aip-permission\admin`:
  - `src/main.ts`: initializes AG Grid via `initAgGrid()` before other plugins.
  - `src/utils/ag-grid.config.ts`: registers community + enterprise modules (`ModuleRegistry.registerModules([AllCommunityModule, AllEnterpriseModule])`), sets license via `LicenseManager.setLicenseKey()`, reads `VITE_AG_GRID_LICENSE_KEY` env or falls back to per-mode defaults; logs init.
  - Example usage: `src/views/permission/resource/index.vue` uses `<ag-grid-vue>` with columnDefs/defaultColDef/rowData and standard grid callbacks.
- Alignment with runtime设计模式: external side-effects (e.g., license, adapter wiring) must stay explicit/config-driven—no implicit DI.

## Why AG Grid Enterprise
- Rich Excel-like UX: pinned columns, sorting/filtering, grouping, tree/aggregation, custom renderers/editors, clipboard.
- Extensibility: cell renderers, value formatters, custom tool panels; module-based enterprise features.
- Ecosystem: Vue/React wrappers, solid docs, supports TypeScript.
- Licensing: commercial; requires license key initialization (see pattern above).

## Integration plan for `packages/web-ide` (frontend)
- Use AG Grid Enterprise (Vue/React/Svelte wrapper TBD; Vue example exists).
- Provide a small init helper mirroring `initAgGrid`:
  - Register community + enterprise modules once.
  - Read license key from env (e.g., `VITE_AG_GRID_LICENSE_KEY`), fallback per-mode default for dev; avoid hardcoding prod keys in repo.
  - Expose a hook to inject runtime contexts (align with runtime设计模式) for side-effect management.
- Grid embedding:
  - Use `<ag-grid-vue>` (or relevant wrapper) for the sheet UI; bind columnDefs, rowData from SPL cell-set model.
  - Implement custom cell renderer/editor to show expression text and evaluation status; integrate with SPL runtime for on-demand execution.
  - Enable selection, resize, clipboard; optional enterprise features (pivot/filters) can be toggled.
- Config/paths to mirror reference:
  - Place init helper under `packages/web-ide/src/ag-grid.config.ts`.
  - Ensure main entry (e.g., `packages/web-ide/src/main.tsx|ts`) calls the init before mounting.
  - Provide env doc for `VITE_AG_GRID_LICENSE_KEY` (and per-mode defaults for local dev only).

## Notes / risks
- License handling: keep keys out of repo; use env or local .env.*; provide dev-only fallback if acceptable.
- Bundle size: AG Grid Enterprise is sizable; consider modular imports and tree-shaking.
- Styling: pick a base theme (alpine/alpine-dark) and layer minimal overrides to avoid heavy theming debt.
- Formula/engine: AG Grid does not provide spreadsheet formulas; SPL expression runtime must drive computations and grid updates.
