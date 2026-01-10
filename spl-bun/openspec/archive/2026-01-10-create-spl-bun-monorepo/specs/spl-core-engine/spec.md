## ADDED Requirements

### Requirement: Step-based execution engine
The system SHALL execute SPL scripts as ordered steps/cells where each step can reference prior outputs and produces a dataset or scalar value.

#### Scenario: Sequential step evaluation
- **GIVEN** a script with Step1 loading a dataset and Step2 filtering Step1 results
- **WHEN** the engine runs the script
- **THEN** Step2 receives Step1 output, evaluates after Step1 completes, and returns the filtered dataset.

### Requirement: Dataset abstraction
The core runtime SHALL expose a dataset/table abstraction with schema metadata and support for iteration, projection, filtering, and aggregation operations (projection/filter/aggregate only in v1).

#### Scenario: Transform dataset
- **GIVEN** a dataset with numeric and string columns
- **WHEN** applying projection, filter, and aggregate operations through the runtime APIs
- **THEN** the runtime returns correctly shaped results with updated schema and computed aggregates.

### Requirement: Error propagation
The engine SHALL surface step failures with context (step identifier, operation, underlying error) and stop subsequent dependent steps.

#### Scenario: Adapter error bubbles up
- **GIVEN** a step that depends on a failed data fetch
- **WHEN** the fetch step throws an adapter error
- **THEN** the engine reports the error with step context and halts dependent step execution.

### Requirement: Operator scope guardrails
The engine SHALL exclude joins and windowing in v1, deferring them to future changes.

#### Scenario: Unsupported operator
- **GIVEN** a script that attempts a join/window operation
- **WHEN** the engine evaluates the step
- **THEN** it rejects the operation with a clear unsupported-feature error rather than executing it.