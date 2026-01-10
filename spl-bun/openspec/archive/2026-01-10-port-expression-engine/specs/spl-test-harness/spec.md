## ADDED Requirements
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