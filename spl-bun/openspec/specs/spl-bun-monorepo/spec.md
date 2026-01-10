# spl-bun-monorepo Specification

## Purpose
TBD - created by archiving change create-spl-bun-monorepo. Update Purpose after archive.
## Requirements
### Requirement: Bun workspace scaffold
The project SHALL provide a `spl-bun/` directory configured as a Bun workspace with root scripts for install/test/build and shared dependency management using TypeScript (no linting in v1).

#### Scenario: Workspace bootstrap
- **GIVEN** Bun is installed
- **WHEN** running `bun install` inside `spl-bun/`
- **THEN** the workspace dependencies install successfully and root scripts for test/build are available.

### Requirement: Multi-package layout
The Bun workspace SHALL define packages for the core runtime engine, SQLite adapter, and shared test utilities/fixtures, managed via Bun workspaces.

#### Scenario: Package discovery
- **GIVEN** the workspace is initialized
- **WHEN** listing workspaces via `bun workspaces` or inspecting the root config
- **THEN** packages for `core`, `sqlite-adapter`, and test utilities are present and linked.

### Requirement: Developer workflow docs
The workspace SHALL document basic developer commands (install, test, build) in `spl-bun/README.md`, noting TypeScript usage and that linting is deferred.

#### Scenario: Readme usage
- **GIVEN** a contributor opens `spl-bun/README.md`
- **WHEN** following the listed commands
- **THEN** they can install deps and run tests without additional setup beyond Bun.

### Requirement: Structure alignment with original
The workspace and packages SHALL preserve naming/directory structure parity with the original esProc where practical to aid cross-referencing.

#### Scenario: Naming parity
- **GIVEN** modules/classes mapped from the Java sources
- **WHEN** inspecting the TypeScript packages
- **THEN** corresponding file and class names are retained where feasible without breaking Bun/TypeScript conventions.

### Requirement: Composer package in workspace
The monorepo SHALL include a `@esproc/composer` package that aggregates core engine, expression evaluator, and adapters into a cohesive entry point for SPL pipelines.

#### Scenario: Composer package available
- **WHEN** installing workspace dependencies
- **THEN** the `@esproc/composer` package is published/built alongside other packages and can be imported by downstream code.

