# spl-test-harness Specification

## Purpose
TBD - created by archiving change create-spl-bun-monorepo. Update Purpose after archive.
## Requirements
### Requirement: Bun test suite
The workspace SHALL include Bun-based automated tests that cover core engine behaviors and SQLite integration.

#### Scenario: Run tests workspace-wide
- **GIVEN** dependencies are installed
- **WHEN** running `bun test` at `spl-bun/`
- **THEN** tests execute across packages and report pass/fail for core and adapter coverage.

### Requirement: SQLite fixtures
Tests SHALL include fixtures to create/reset a SQLite database with seed data for repeatable runs.

#### Scenario: Reusable SQLite fixture
- **GIVEN** integration tests needing tables and sample rows
- **WHEN** invoking the fixture setup
- **THEN** a fresh SQLite database with seed tables is available and cleaned up after tests.

### Requirement: Engine behavior coverage
Tests SHALL validate step dependency resolution, dataset transformations, and error propagation paths.

#### Scenario: Step dependency test
- **GIVEN** a scripted sequence with dependent steps
- **WHEN** executing tests
- **THEN** assertions confirm outputs match expectations and failures block dependent steps.

### Requirement: Expression evaluation coverage
The Bun test suite SHALL include unit and integration coverage for the expression parser/evaluator, including operators, function registry lookups, and dataset/engine integration paths.

#### Scenario: Expression unit tests
- **GIVEN** expression fixtures covering literals, arithmetic/comparison, logical short-circuit, and null-handling
- **WHEN** running `bun test`
- **THEN** the tests assert correct results and error messages for invalid expressions without relying on runtime `eval`.

#### Scenario: Integration tests with datasets and steps
- **GIVEN** datasets and engine steps that use expression strings for filters, computed columns, joins, or window outputs
- **WHEN** executing the Bun test suite
- **THEN** integration tests validate correct wiring to the evaluator and surface contextual errors when expressions reference missing columns or invalid syntax.

### Requirement: Join test coverage
Tests SHALL validate inner and left join behaviors on core datasets, including key matches, non-matches, and column disambiguation.

#### Scenario: Join assertions
- **GIVEN** sample datasets with overlapping and missing keys
- **WHEN** running join-focused tests
- **THEN** assertions confirm correct row counts, null-fill for left joins, and expected column naming.

### Requirement: Window test coverage
Tests SHALL validate window functions (row_number, rank/dense_rank, running_sum/avg) with partition/order variations.

#### Scenario: Window assertions
- **GIVEN** partitioned and ordered sample data
- **WHEN** running window-focused tests
- **THEN** outputs include correct rankings and running aggregates per partition.

### Requirement: Integration tests with SQLite fixtures
Integration tests SHALL combine SQLite-fed datasets with join and window steps to ensure adapter outputs participate correctly.

#### Scenario: SQLite integration
- **GIVEN** SQLite fixtures producing datasets
- **WHEN** applying join/window steps in integration tests
- **THEN** results match expected joined/analytical outputs and errors surface with context on invalid specs.

### Requirement: Composer integration tests
The test harness SHALL include end-to-end tests that execute SPL pipelines through the composer, covering dataset loads (SQLite), expression evaluation, joins/windows, and result verification.

#### Scenario: Composer executes pipeline
- **GIVEN** fixtures with sample SQLite data and expression-driven steps
- **WHEN** running `bun test`
- **THEN** composer integration tests pass, proving the facade correctly orchestrates engine, expression, and adapter components.

