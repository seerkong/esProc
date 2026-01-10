## MODIFIED Requirements

### Requirement: Dataset abstraction
The core runtime SHALL expose a dataset/table abstraction with schema metadata and support for iteration, projection, filtering, aggregation, join (inner/left), and window operations (row_number/rank/dense_rank/running_sum/running_avg with partition/order).

#### Scenario: Transform dataset with joins
- **GIVEN** two datasets with a common key
- **WHEN** performing an inner or left join via the runtime APIs
- **THEN** the runtime returns a merged dataset with disambiguated column names and correct null-handling for non-matching rows.

#### Scenario: Apply window analytics
- **GIVEN** a dataset with partition and order columns and a numeric measure
- **WHEN** applying window functions (row_number, rank/dense_rank, running_sum/avg)
- **THEN** the runtime appends computed window columns with results scoped to each partition and ordered frame.

## ADDED Requirements

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
