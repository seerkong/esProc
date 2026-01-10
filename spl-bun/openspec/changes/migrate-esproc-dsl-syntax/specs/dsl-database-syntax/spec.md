# Specification: DSL Database Syntax

## Reference
- **[Java esProc 行为分析](../../java-analysis.md)** - Java 源码行为参考

## Overview
This spec defines the database-related DSL syntax for spl-dsl, bringing compatibility with esProc Java's database query expressions.

## ADDED Requirements

### Requirement: Member Function Call Syntax
The DSL parser must support member function call syntax for database operations.

#### Scenario: Parse db.query with simple SQL
**Given** the DSL source `demo.query("select * from STATES")`
**When** parseDSL is called
**Then** the result should be a MemberCallNode with:
  - type: "memberCall"
  - object: "demo"
  - method: "query"
  - args: ["select * from STATES"]

#### Scenario: Parse db.query with parameterized SQL
**Given** the DSL source `db.query("select * from users where id = ?", userId)`
**When** parseDSL is called
**Then** the result should be a MemberCallNode with:
  - type: "memberCall"
  - object: "db"
  - method: "query"
  - args: ["select * from users where id = ?", "userId"]

#### Scenario: Parse db.query with multiple parameters
**Given** the DSL source `demo.query("select * from t where a = ? and b = ?", x, y)`
**When** parseDSL is called
**Then** the result should be a MemberCallNode with:
  - type: "memberCall"
  - object: "demo"
  - method: "query"
  - args: ["select * from t where a = ? and b = ?", "x", "y"]

#### Scenario: Parse db.execute for non-query operations
**Given** the DSL source `demo.execute("insert into logs (msg) values (?)", message)`
**When** parseDSL is called
**Then** the result should be a MemberCallNode with:
  - type: "memberCall"
  - object: "demo"
  - method: "execute"
  - args: ["insert into logs (msg) values (?)", "message"]

---

### Requirement: Global Function Call Syntax
The DSL parser must support global function call syntax for creating database connections.

#### Scenario: Parse connect with datasource name
**Given** the DSL source `connect("demo")`
**When** parseDSL is called
**Then** the result should be a GlobalCallNode with:
  - type: "globalCall"
  - function: "connect"
  - args: ["demo"]

#### Scenario: Parse connect with driver and URL
**Given** the DSL source `connect("org.sqlite.JDBC", "jdbc:sqlite:demo.db")`
**When** parseDSL is called
**Then** the result should be a GlobalCallNode with:
  - type: "globalCall"
  - function: "connect"
  - args: ["org.sqlite.JDBC", "jdbc:sqlite:demo.db"]

---

### Requirement: Query Evaluation via Adapter
The compiled DSL must execute queries through the execution context's adapter.

#### Scenario: Evaluate db.query with registered connection
**Given** a compiled DSL from `demo.query("select * from STATES")`
**And** an execution context with:
  - connections: Map containing "demo" → { name: "demo", type: "sqlite" }
  - adapters.sqliteQuery: mock function
**When** evaluate() is called
**Then** the sqliteQuery adapter should be called with:
  - connection: { name: "demo", type: "sqlite" }
  - sql: "select * from STATES"
  - params: undefined or []

#### Scenario: Evaluate db.query with unknown connection
**Given** a compiled DSL from `unknown.query("select 1")`
**And** an execution context with no "unknown" connection registered
**When** evaluate() is called
**Then** an error should be thrown: "Connection 'unknown' not found"

#### Scenario: Evaluate db.query with parameters
**Given** a compiled DSL from `demo.query("select * from users where id = ?", userId)`
**And** an execution context with:
  - connections: Map containing "demo" → { name: "demo", type: "sqlite" }
  - scope: { userId: 123 }
  - adapters.sqliteQuery: mock function
**When** evaluate() is called
**Then** the sqliteQuery adapter should be called with:
  - connection: { name: "demo", type: "sqlite" }
  - sql: "select * from users where id = ?"
  - params: [123]

#### Scenario: Evaluate db.query with multiple parameters
**Given** a compiled DSL from `demo.query("select * from t where a = ? and b = ?", x, y)`
**And** an execution context with:
  - connections: Map containing "demo"
  - scope: { x: "foo", y: 42 }
  - adapters.sqliteQuery: mock function
**When** evaluate() is called
**Then** the sqliteQuery adapter should be called with:
  - sql: "select * from t where a = ? and b = ?"
  - params: ["foo", 42]

---

### Requirement: Backward Compatibility
The `$q("sql")` syntax must continue to work.

#### Scenario: Parse legacy $q syntax
**Given** the DSL source `$q("select * from STATES")`
**When** parseDSL is called
**Then** the result should be an SQLNode with:
  - type: "sql"
  - expression: containing "select * from STATES"

#### Scenario: Evaluate legacy $q syntax
**Given** a compiled DSL from `$q("select 1")`
**And** an execution context with sqliteQuery adapter
**When** evaluate() is called
**Then** the adapter should be called with the SQL

## MODIFIED Requirements

### Requirement: DSLExecutionContext Extensions
The execution context interface must be extended to support named connections.

#### Scenario: Context accepts connections map
**Given** a DSLExecutionContext with connections Map
**When** a memberCall node evaluates db.query
**Then** it should look up the connection by object name

## Type Definitions

```typescript
// New node types
interface MemberCallNode {
  type: "memberCall";
  expression: string;
  object: string;
  method: string;
  args: string[];
}

interface GlobalCallNode {
  type: "globalCall";
  expression: string;
  function: string;
  args: string[];
}

// Extended context
interface DBConnection {
  name: string;
  type: "sqlite" | "jdbc";
  path?: string;
}

interface DSLExecutionContext {
  // ... existing fields ...
  connections?: Map<string, DBConnection>;
}
```

## Error Cases

| Expression | Error |
|------------|-------|
| `unknown.query("sql")` | Connection 'unknown' not found |
| `demo.unknownMethod()` | Unknown member function 'unknownMethod' |
| `demo.query()` | query() requires at least 1 argument |
| `connect()` | connect() requires at least 1 argument |
