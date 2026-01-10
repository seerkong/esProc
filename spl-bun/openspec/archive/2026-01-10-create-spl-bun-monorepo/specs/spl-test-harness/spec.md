## ADDED Requirements

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
