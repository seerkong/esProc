## ADDED Requirements
### Requirement: Composer integration tests
The test harness SHALL include end-to-end tests that execute SPL pipelines through the composer, covering dataset loads (SQLite), expression evaluation, joins/windows, and result verification.

#### Scenario: Composer executes pipeline
- **GIVEN** fixtures with sample SQLite data and expression-driven steps
- **WHEN** running `bun test`
- **THEN** composer integration tests pass, proving the facade correctly orchestrates engine, expression, and adapter components.
