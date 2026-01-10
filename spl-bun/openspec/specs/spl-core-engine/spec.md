# spl-core-engine Specification

## Purpose
TBD - created by archiving change create-spl-bun-monorepo. Update Purpose after archive.
## Requirements
### Requirement: Step-based execution engine
The system SHALL execute SPL scripts as ordered steps/cells where each step can reference prior outputs and produces a dataset or scalar value.

#### Scenario: Sequential step evaluation
- **GIVEN** a script with Step1 loading a dataset and Step2 filtering Step1 results
- **WHEN** the engine runs the script
- **THEN** Step2 receives Step1 output, evaluates after Step1 completes, and returns the filtered dataset.

### Requirement: Dataset abstraction
The core runtime SHALL expose a dataset/table abstraction with schema metadata and support for iteration, projection, filtering, aggregation, join (inner/left), and window operations (row_number/rank/dense_rank/running_sum/running_avg with partition/order).

#### Scenario: Transform dataset
- **GIVEN** a dataset with numeric and string columns
- **WHEN** applying projection, filter, and aggregate operations through the runtime APIs
- **THEN** the runtime returns correctly shaped results with updated schema and computed aggregates.

#### Scenario: Transform dataset with joins
- **GIVEN** two datasets with a common key
- **WHEN** performing an inner or left join via the runtime APIs
- **THEN** the runtime returns a merged dataset with disambiguated column names and correct null-handling for non-matching rows.

#### Scenario: Apply window analytics
- **GIVEN** a dataset with partition and order columns and a numeric measure
- **WHEN** applying window functions (row_number, rank/dense_rank, running_sum/avg)
- **THEN** the runtime appends computed window columns with results scoped to each partition and ordered frame.

### Requirement: Error propagation
The engine SHALL surface step failures with context (step identifier, operation, underlying error) and stop subsequent dependent steps.

#### Scenario: Adapter error bubbles up
- **GIVEN** a step that depends on a failed data fetch
- **WHEN** the fetch step throws an adapter error
- **THEN** the engine reports the error with step context and halts dependent step execution.

### Requirement: Expression parsing and evaluation
The core runtime SHALL parse esProc-style expressions into an AST and evaluate them with correct operator precedence, null/boolean semantics, and a pluggable function library (math/string/datetime/collection) without relying on `eval`.

#### Scenario: Evaluate expression over row context
- **GIVEN** a row `{a: 2, b: 5}` and expression `a + b * 2`
- **WHEN** the evaluator runs with the row bound as variables
- **THEN** it returns `12` and preserves operator precedence without mutating the row.

#### Scenario: Evaluate function and null semantics
- **GIVEN** an expression `nvl(name, "unknown")` where `name` is null
- **WHEN** the evaluator executes using the function registry
- **THEN** it returns the fallback string and does not throw; errors include expression text and position when evaluation fails.

### Requirement: Expression-driven step operations
The engine SHALL allow dataset and step definitions to accept expression strings for filters, computed columns, and join/window parameters, resolving variables from step outputs and row context with error messages that cite the step id and expression location.

#### Scenario: Filter step with expression
- **GIVEN** a dataset step output and a subsequent step that filters with expression `amount > 100 and status = "open"`
- **WHEN** the engine executes the filter step
- **THEN** rows are filtered accordingly and any missing column references raise a contextual error naming the step and expression.

#### Scenario: Window or join parameter via expression
- **GIVEN** a window step that computes `running_sum` over `value * 1.1` and a join step that uses `upper(customer_id)` as a key
- **WHEN** the engine evaluates these steps
- **THEN** expressions are resolved per row and step context, producing correct computed outputs or a clear error if the expression is invalid.

### Requirement: Join step execution
The engine SHALL allow join operations as steps that consume prior dataset outputs and surface errors with step context when keys or schemas are invalid.

#### Scenario: Join step wiring
- **GIVEN** Step1 loads dataset A and Step2 loads dataset B
- **WHEN** Step3 performs a left join on a specified key
- **THEN** Step3 receives the joined dataset and dependent steps can consume it; invalid key references raise a contextual error.

### Requirement: Window step execution
The engine SHALL allow window operations as steps that consume prior dataset outputs and surface errors when window specs are invalid (e.g., missing order for ranking).

#### Scenario: Window step wiring
- **GIVEN** a dataset step output
- **WHEN** a window step adds row_number and running_sum over a partition/order spec
- **THEN** the step produces a dataset with the new window columns; invalid specs produce a contextual error and halt dependents.

### Requirement: Composition facade
The runtime SHALL expose a composition/facade layer that wires dataset operations, expression evaluation, and adapters (e.g., SQLite) so callers can run pipelines via a single API without manual step wiring, and it MUST manage external side effects using the documented runtime设计模式 (no implicit dependency injection).

#### Scenario: Run pipeline via composer
- **GIVEN** a set of step definitions (loads, expressions, joins/windows)
- **WHEN** invoking the composer facade to execute the pipeline
- **THEN** steps are assembled with the engine, expressions are evaluated, adapters are invoked, runtime contexts manage external side effects, and the final results are returned with appropriate error context.

