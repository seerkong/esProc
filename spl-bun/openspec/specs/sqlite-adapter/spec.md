# sqlite-adapter Specification

## Purpose
TBD - created by archiving change create-spl-bun-monorepo. Update Purpose after archive.
## Requirements
### Requirement: SQLite connection and query execution
The system SHALL provide a SQLite adapter that opens database files/URIs, executes SQL with optional parameters, and streams results.

#### Scenario: Parameterized query
- **GIVEN** a SQLite database file path and a SQL statement with placeholders
- **WHEN** executing via the adapter with provided parameters
- **THEN** the adapter returns rows for the parameterized query without mutating the DB.

### Requirement: Dataset integration
The adapter SHALL expose query results as core runtime datasets with schema metadata and row iteration compatible with core operations.

#### Scenario: Consume query results in engine
- **GIVEN** a core engine step that calls the SQLite adapter
- **WHEN** the adapter returns rows
- **THEN** the engine receives a dataset with correct column names/types usable by subsequent steps.

### Requirement: Error handling
The adapter SHALL propagate connection/query errors with details (SQL text, parameters, underlying message) to the core engine.

#### Scenario: Invalid SQL surfaces error
- **GIVEN** an invalid SQL statement
- **WHEN** the adapter executes it
- **THEN** an error is raised containing the SQL context and is surfaced to the engine, preventing downstream steps.

