## ADDED Requirements
### Requirement: Web IDE package with stacked authoring and results tables
The system SHALL provide a `packages/web-ide` frontend package that renders two stacked tables: (1) an editable HTML/CSS spreadsheet-style grid (columns A/B/C…, rows for steps) for SPL DSL entry, and (2) a results table (may use AG Grid) to display multi-row outputs.

#### Scenario: Vertical layout with editable cells
- **GIVEN** the web-ide debug page loads with empty rows and A/B/C headers
- **WHEN** the user clicks a cell and edits SPL DSL text, then runs execution
- **THEN** the authoring grid remains editable, rows grow vertically, and the results table updates separately without mixing expression text into result columns.

### Requirement: Spreadsheet editor supports SPL DSL
The web IDE SHALL allow cells to contain esProc SPL DSL (control flow/commands/SQL marker) parsed via `@esproc/spl-dsl`, supporting A1-style references across multiple columns and dependency resolution.

#### Scenario: Evaluate dependent DSL cells
- **GIVEN** cells A1=`$q(\"select * from t\")`, A2=`if len(A1)>0`, A3=`return A1`
- **WHEN** the user triggers execution from the UI
- **THEN** the IDE parses DSL via `@esproc/spl-dsl`, resolves dependencies in order, and displays results/errors per cell using the runtime-design-pattern context.

### Requirement: Explicit runtime side-effect wiring
The web IDE SHALL obtain all external side effects (adapters, logging) via explicit runtime contexts following the documented runtime设计模式; implicit dependency injection is prohibited.

#### Scenario: Host provides runtime context
- **GIVEN** a host app passes a runtime context with adapters and logger into the web-ide initializer
- **WHEN** the grid executes cell expressions or DSL involving data adapters
- **THEN** the execution uses the provided context explicitly; missing context yields a clear initialization error instead of silent fallback.

### Requirement: Documentation and integration validation
The web IDE SHALL include documentation for setup (env vars, runtime wiring, DSL usage) and automated tests that validate grid initialization and a minimal end-to-end cell execution path.

#### Scenario: Validate setup
- **GIVEN** a fresh checkout
- **WHEN** running the documented test command
- **THEN** tests pass covering DSL parsing + vertical spreadsheet execution, and docs in `spl-bun/doc` describe how to configure and run the web IDE.
