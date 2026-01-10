## ADDED Requirements
### Requirement: Composition facade
The runtime SHALL expose a composition/facade layer that wires dataset operations, expression evaluation, and adapters (e.g., SQLite) so callers can run pipelines via a single API without manual step wiring, and it MUST manage external side effects using the documented runtime设计模式 (no implicit dependency injection).

#### Scenario: Run pipeline via composer
- **GIVEN** a set of step definitions (loads, expressions, joins/windows)
- **WHEN** invoking the composer facade to execute the pipeline
- **THEN** steps are assembled with the engine, expressions are evaluated, adapters are invoked, runtime contexts manage external side effects, and the final results are returned with appropriate error context.
