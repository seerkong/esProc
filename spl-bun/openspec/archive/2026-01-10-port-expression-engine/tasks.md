## Tasks (sequential unless noted)
1. [x] Inventory `com.scudata.expression` operators/functions and define the first-cut compatibility scope for the TS port (prioritize features needed by filter/aggregate/join/window and step params).
2. [x] Design the TypeScript module layout (package placement, AST/tokenizer shape, evaluation context, null/boolean semantics) while keeping names/structure close to the Java sources where practical.
3. [x] Implement the expression parser/evaluator with core operators and the initial function set (math/string/datetime/collection), plus variable resolution for dataset rows and step context.
4. [x] Port/author tests covering parsing, evaluation semantics (arithmetic, comparison, logical short-circuit, null handling), function library basics, and integration with dataset/engine steps.
5. [x] Update docs/examples to show expression usage in SPL-Bun and ensure `bun test` and `bun run build --filter ...` succeed across packages.
6. [x] Validation: run `openspec validate port-expression-engine --strict` after spec/doc updates.
