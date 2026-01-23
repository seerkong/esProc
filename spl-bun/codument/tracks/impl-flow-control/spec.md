## Overview

This track adds SPL (Java) style flow-control statements to the TypeScript runtime.

Key scope rules:
- Primary implementation lives in `packages/spl-flow`.
- Expression-level behavior goes to `packages/expression` only when Java SPL implements it in the expression engine; otherwise keep it in `spl-flow`.

Key difference vs Java SPL examples:
- Java SPL often shows calculable cells with a leading `=`. In this project (Web-IDE), expressions are entered without a leading `=`. The runtime SHALL accept both forms, but MUST NOT require `=`.

---

## ADDED Requirements

### Requirement: Grid-based flow evaluation
The `spl-flow` runtime SHALL evaluate a 2D grid of cells addressed by (row, col) and by `cellRef` (e.g. `A1`).

- Each evaluated cell SHALL write its value into `scope[cellRef]`.
- Evaluation order SHALL follow SPL grid navigation rules (row/col positioning + `setNext`-style navigation), skipping blank/comment cells.
- The runtime SHALL support nested code blocks using indentation (cells to the right of a command cell).

#### Scenario: Basic sequential evaluation remains supported
- **GIVEN** cells:
  - `A1: a = 2`
  - `A2: b = 3`
  - `A3: a + b`
- **WHEN** evaluating the flow
- **THEN** `scope.A3` is `5`


### Requirement: Recognize flow-control command cells
The runtime SHALL recognize the following command keywords (case-insensitive) when they appear at the start of a trimmed cell string:

- `if`, `else`, `elseif` (and `else if`)
- `for`
- `break`, `next` (alias: `continue`)
- `goto`
- `func`
- `return`, `result`, `end`
- `try`

Non-command cells SHALL be treated as expression cells.

#### Scenario: Non-keyword cell is treated as an expression
- **GIVEN** a cell `A1: 1 + 2`
- **WHEN** evaluating the flow
- **THEN** the cell is evaluated as an expression and `scope.A1` is `3`


### Requirement: If / else-if / else
The runtime SHALL implement SPL-style conditional branching:

- `if <condExpr>` evaluates `<condExpr>`; when truthy, it executes its indented block.
- When the `if` condition is falsy, it SHALL execute the first matching `elseif` / `else if` branch, otherwise the `else` branch if present, otherwise it SHALL skip the entire if-chain.
- `elseif` / `else if` branches MAY appear either:
  - on the same row to the right of the `if`, or
  - on later rows at the same column as the `if`.
- When a branch is taken, remaining branches MUST be skipped.

#### Scenario: Multi-row if/elseif/else selects the right branch
- **GIVEN** cells:
  - `A1: if x > 0`  `B1: x * 2`
  - `A2: else if x == 0` `B2: 100`
  - `A3: else` `B3: -1`
- **WHEN** evaluating with `scope.x = 0`
- **THEN** `scope.B2` is `100`


### Requirement: For loops + break/next
The runtime SHALL implement SPL-style loops:

- `for` (no args): infinite loop, exits only via `break` / `end`.
- `for n`: integer loop from `1..n`.
- `for start,end` and `for start,end,step`: integer range loop.
- `for sequenceExpr`: sequence loop.
- `for conditionExpr`: while-style loop.

Loop variable binding:
- For each iteration, the loop variable (current value) SHALL be written into the loop cell's `cellRef` (e.g. the `for` at `A1` writes the current value into `scope.A1`).

Control statements:
- `break` exits the nearest loop.
- `next` (and `continue`) skips to the next iteration of the nearest loop.
- `break <cellRef>` and `next <cellRef>` target an outer loop whose `for` statement is located at `<cellRef>`.

#### Scenario: for n iterates 1..n
- **GIVEN** cells:
  - `A1: sum = 0`
  - `A2: for 3` `B2: sum += A2`
  - `A3: sum`
- **WHEN** evaluating the flow
- **THEN** `scope.A3` is `6`


### Requirement: goto
The runtime SHALL support `goto <cellRef>`.

- `goto` SHALL move execution to the target cell.
- It MUST be illegal to jump into a deeper indentation scope (e.g. into a loop body). If attempted, evaluation MUST fail with a clear error.

#### Scenario: goto jumps to a target cell
- **GIVEN** cells:
  - `A1: x = 0`
  - `A2: goto A4`
  - `A3: x = 1`
  - `A4: x = 2`
- **WHEN** evaluating the flow
- **THEN** `scope.A4` is `2` and `scope.A3` remains unset


### Requirement: Subroutines (func) and returns
The runtime SHALL support SPL-style subroutines (code blocks) defined by a `func` command cell.

- A cell containing the `func` statement is the **master cell** of the subroutine; its body is the indented block.
- The subroutine body SHALL NOT execute during normal top-level flow execution. It executes only when invoked via the `func(...)` expression function.
- A subroutine is invoked as `func(<masterCell>, x1, x2, ...)` (Java SPL style).
- When invoking a subroutine, parameters SHALL be assigned from left to right starting at the master cell:
  - `x1` → master cell (e.g. `A2`)
  - `x2` → next cell to the right on the same row (e.g. `B2`)
  - `x3` → next (e.g. `C2`), and so on.
- `return <expr>` returns from the current subroutine invocation.
- If no `return` executes, the subroutine returns the value of the last evaluated expression cell in the subroutine block (or `null` if none).
- `result <expr>` sets the flow result value and terminates top-level flow execution.
- `end` terminates flow execution immediately; `end "message"` terminates with an error message.

#### Scenario: Simple subroutine call returns a value
- **GIVEN** cells:
  - `A1: func` `B1: return A1 + B1`
  - `A2: func(A1, 1, 2)`
- **WHEN** evaluating the flow
- **THEN** `scope.A2` is `3`


### Requirement: try (error capture)
The runtime SHALL support SPL-style `try` blocks.

- `try` defines a try block whose body is the indented block.
- If any error is thrown while executing the try block, it MUST be caught.
- The error message MUST be stored into the `try` cell's value (e.g. `scope.A1` if `try` is at `A1`).
- Execution MUST continue after the try block.

#### Scenario: try captures an error and continues
- **GIVEN** cells:
  - `A1: try` `B1: unknownFunc()`
  - `A2: 1 + 1`
- **WHEN** evaluating the flow
- **THEN** `scope.A1` is a non-empty error string
- **AND** `scope.A2` is `2`
