## ADDED Requirements
### Requirement: Composer package in workspace
The monorepo SHALL include a `@esproc/composer` package that aggregates core engine, expression evaluator, and adapters into a cohesive entry point for SPL pipelines.

#### Scenario: Composer package available
- **WHEN** installing workspace dependencies
- **THEN** the `@esproc/composer` package is published/built alongside other packages and can be imported by downstream code.
