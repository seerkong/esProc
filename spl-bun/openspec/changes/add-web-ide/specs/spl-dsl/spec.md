## ADDED Requirements
### Requirement: SPL DSL parsing and evaluation package
The system SHALL provide a `@esproc/spl-dsl` package that ports esProc SPL DSL parsing (Command/ParamParser/KeyWord/CellRef) and exposes compile/evaluate helpers usable by web-ide and other callers.

#### Scenario: Parse and compile DSL string
- **GIVEN** a DSL string containing control flow or SQL markers and cell references (e.g., `$q(\"select * from t\")` or `if A1>0 return A1`)
- **WHEN** a caller invokes the DSL parser/compile helper
- **THEN** it returns a structured representation or executable function that resolves cell references via provided context and signals syntax errors with clear messages.

#### Scenario: Evaluate DSL with dependencies
- **GIVEN** DSL referencing other cells and runtime adapters
- **WHEN** evaluation runs with explicit runtime context (adapters/logger per runtime设计模式)
- **THEN** dependencies are resolved in order, and missing context yields descriptive errors instead of implicit fallbacks.
