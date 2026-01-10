# Tasks: Migrate esProc DSL Syntax

## Reference
- **[Java esProc 行为分析](./java-analysis.md)** - 实现参考

## Task List

### 1. Extend spl-dsl Parser for Member Call Syntax
**Package**: `@esproc/spl-dsl`
**Status**: Completed
**Dependencies**: None

**Work Items**:
- [x] Add `memberCall` node type to `DSLNodeType`
- [x] Add `MemberCallNode` interface with `object`, `method`, `args` fields
- [x] Implement pattern matching for `<identifier>.<method>(<args>)` in `parseDSL()`
- [x] Handle argument parsing:
  - String literals: `"..."` or `'...'`
  - Variable references: `userId`, `x`
  - Numbers: `123`, `45.6`
- [x] Support multiple comma-separated arguments
- [x] Add unit tests for parsing:
  - `demo.query("sql")` - simple query
  - `db.query("sql", param)` - single parameter
  - `db.query("sql", p1, p2, p3)` - multiple parameters

**Validation**:
```bash
bun test packages/spl-dsl
```

---

### 2. Extend spl-dsl Parser for Global Function Syntax
**Package**: `@esproc/spl-dsl`
**Status**: Completed
**Dependencies**: None (can run parallel with Task 1)

**Work Items**:
- [x] Add `globalCall` node type to `DSLNodeType`
- [x] Add `GlobalCallNode` interface with `function`, `args` fields
- [x] Implement pattern matching for `<identifier>(<args>)` in `parseDSL()`
- [x] Add unit tests for parsing `connect("demo")` syntax

**Validation**:
```bash
bun test packages/spl-dsl
```

---

### 3. Implement Member Function Evaluation
**Package**: `@esproc/spl-dsl`
**Status**: Completed
**Dependencies**: Task 1

**Work Items**:
- [x] Extend `DSLExecutionContext` with `connections` map
- [x] Create member function registry (initially just `query`)
- [x] Implement `memberCall` case in `compileDSL()` switch statement
- [x] Add `query` handler that:
  - Looks up connection from `connections` map by object name
  - Extracts SQL from first arg
  - Resolves remaining args from scope (for parameterized queries)
  - Delegates to `sqliteQuery` adapter with `{ connection, sql, params }`
- [x] Add unit tests:
  - `demo.query("sql")` with mock adapter
  - `demo.query("sql", param)` with scope variable resolution
  - Error case: unknown connection

**Validation**:
```bash
bun test packages/spl-dsl
```

---

### 4. Implement Global Function Evaluation
**Package**: `@esproc/spl-dsl`
**Status**: Completed
**Dependencies**: Task 2

**Work Items**:
- [x] Create global function registry (initially just `connect`)
- [x] Implement `globalCall` case in `compileDSL()` switch statement
- [x] `connect` returns a reference object `{ __type: "dbRef", name }`
- [x] Add unit tests for `connect()` returning connection reference

**Validation**:
```bash
bun test packages/spl-dsl
```

---

### 5. Update web-server to Use spl-dsl
**Package**: `@esproc/web-server`
**Status**: Completed
**Dependencies**: Tasks 3, 4

**Work Items**:
- [x] Add `@esproc/spl-dsl` as dependency in package.json
- [x] Remove temporary `parseDemoQuery()` function from server.ts
- [x] Create long-lived connection registry with "demo" pre-registered at startup
- [x] Update execute endpoint to:
  - Use `compileDSL()` to parse expression
  - Call `evaluate()` with connections and adapters
- [x] Implement `sqliteQuery` adapter:
  - Get SQLite Database instance from connection
  - Use `db.prepare(sql).all(...params)` for parameterized queries
  - Return `{ columns, rows }` result
- [x] Handle evaluation errors with proper error responses
- [x] Test end-to-end:
  - `demo.query("select * from STATES")` - simple query
  - `demo.query("select * from STATES where STATEID = ?", 1)` - parameterized

**Validation**:
```bash
# Start server and test
curl -X POST http://localhost:4176/api/execute \
  -H "Content-Type: application/json" \
  -d '["demo.query(\"select * from STATES limit 2\")"]'
```

---

### 6. Update web-shared Types (Optional)
**Package**: `@esproc/web-shared`
**Status**: Completed
**Dependencies**: None

**Work Items**:
- [x] Add `DBConnection` type definition if needed for shared use
- [x] Export from web-shared for frontend consumption

---

### 7. Documentation and Cleanup
**Status**: Completed
**Dependencies**: All above tasks

**Work Items**:
- [x] Update CLAUDE.md with new DSL syntax examples
- [x] Remove TODO comments about temporary workaround in server.ts
- [x] Add JSDoc comments to new types and functions

## Execution Order

```
Task 1 ─────┐
            ├──→ Task 3 ─────┐
Task 2 ─────┤                ├──→ Task 5 ──→ Task 7
            └──→ Task 4 ─────┘
                    │
Task 6 ─────────────┘ (parallel)
```

## Estimated Effort
- Tasks 1-4: Core DSL changes (medium complexity)
- Task 5: Integration (medium complexity)
- Tasks 6-7: Polish (low complexity)

Total: ~5-7 discrete implementation steps
