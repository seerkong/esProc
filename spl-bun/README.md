# SPL Bun workspace

This workspace hosts a TypeScript reimplementation of the esProc core engine with an initial SQLite adapter. Bun is required.

## Setup
- Install Bun (https://bun.sh)
- Install deps: `bun install`

## Scripts
- `bun test` — run all workspace tests (core + sqlite adapter + fixtures)
- `bun run build` — build all packages

Notes: TypeScript only; linting is deferred for v1. Naming and directory structure aim to stay close to the original esProc sources where practical.


## Features
- Core dataset ops: projection, filter, aggregate, join (inner/left), window functions (row_number/rank/dense_rank/running_sum/running_avg)
- Expression engine: parse/evaluate esProc-style expressions (math/string/datetime/collection functions) for filters, computed columns, join/window parameters
- SQLite adapter for loading datasets; joins/windows run in-memory


## Examples

### Join datasets
```ts
import { DataSet } from "@esproc/core";

const employees = DataSet.fromRows([
  { id: 1, dept: "eng", name: "alice" },
  { id: 2, dept: "sales", name: "bob" },
]);
const departments = DataSet.fromRows([
  { dept: "eng", manager: "mike" },
  { dept: "sales", manager: "sara" },
]);

const joined = employees.join(departments, { type: "left", leftKeys: ["dept"] });
// joined rows include manager; missing matches are null/undefined
```

### Window functions
```ts
import { DataSet } from "@esproc/core";

const ds = DataSet.fromRows([
  { dept: "eng", salary: 10 },
  { dept: "eng", salary: 20 },
  { dept: "sales", salary: 15 },
]);

const withWindow = ds.window({
  partitionBy: ["dept"],
  orderBy: [{ column: "salary", direction: "desc" }],
  outputs: {
    rowNumber: "row_no",
    rank: "rank",
    runningSum: { column: "salary" },
  },
});
// withWindow rows now include row_no, rank, running_sum_salary
```

### Expression filters & computed columns
```ts
import { DataSet } from "@esproc/core";

const ds = DataSet.fromRows([
  { id: 1, amount: 40, status: "open" },
  { id: 2, amount: 10, status: "closed" },
]);

const computed = ds.withComputedColumns({ gross: "amount * 1.1" });
const filtered = computed.filterExpr("gross > 30 and status = \"open\"");
// filtered rows contain only id 1
```

### Step orchestration
```ts
import { Engine, createComputeStep, createFilterStep, createJoinStep, createWindowStep } from "@esproc/core";
import { createSqliteStep } from "@esproc/sqlite-adapter";

const loadItems = createSqliteStep("items", { dbPath: "./sample.db", sql: "SELECT id, dept, price FROM items" });
const loadDepts = createSqliteStep("depts", { dbPath: "./sample.db", sql: "SELECT dept, manager FROM departments" });
const joinStep = createJoinStep("joined", { type: "inner", leftKeys: ["dept"], leftStep: "items", rightStep: "depts" });
const computeStep = createComputeStep("with_gross", { sourceStep: "joined", columns: { gross: "price * 1.1" } });
const windowStep = createWindowStep("ranked", {
  sourceStep: "with_gross",
  spec: {
    partitionBy: ["dept"],
    orderBy: [{ column: "price", direction: "desc" }],
    outputs: { rowNumber: "row_no", runningSum: { column: "price", expression: "gross" } },
  },
});
const filterStep = createFilterStep("filtered", {
  sourceStep: "ranked",
  expression: "gross > 30",
});

const engine = new Engine();
await engine.run([loadItems, loadDepts, joinStep, computeStep, windowStep, filterStep]);
```
