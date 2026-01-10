## ADDED Requirements

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
