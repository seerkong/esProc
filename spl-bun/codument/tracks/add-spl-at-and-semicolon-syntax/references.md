# References (Local and Copied)

This track is self-contained.

## Java SPL semantics (local sources)

- `../src/main/java/com/scudata/expression/fn/T.java`
  - Comment summary:
    - Read files by extension: txt/csv/xls/xlsx/btx/ctx
    - For Excel: `s` is sheet name
    - When `A` is present, it writes (export)
    - Options:
      - `@b` no title row (default has title)
      - `@c` read as cursor

## Syntax reminder

- SPL examples often show a leading `=` at the start of each cell.
- In THIS project's Web IDE, cells do NOT include the leading `=`. Use `T(...)` directly.

## Target examples for TS after this track

- Import sheet by name:
  - `T("./data/scores.xlsx"; "School1")`

- Export sheet by name:
  - `T("./data/out/scores.xlsx", data; "School1")`

- Disable header row:
  - `T@b("./data/scores.xlsx"; "School1")`
