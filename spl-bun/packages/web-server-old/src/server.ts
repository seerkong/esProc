import { Elysia } from "elysia";
import cors from "@elysiajs/cors";
import { apiRoutes, type RunSheetRequest, type RunSheetResponse, mapDataSetSummary } from "@esproc/web-shared";
import { DataSet } from "@esproc/core";

const sampleData = DataSet.fromRows([
  { id: 1, name: "widget", price: 10.5, active: 1, dept: "eng" },
  { id: 2, name: "gadget", price: 12.0, active: 0, dept: "eng" },
  { id: 3, name: "sprocket", price: 7.25, active: 1, dept: "sales" },
]);

function createApp() {
  const app = new Elysia().use(
    cors({
      origin: "*",
    }),
  );

  app.get(apiRoutes.health, () => ({ status: "ok" }));

  app.post(apiRoutes.runSheet, async ({ body }) => {
    const req = body as RunSheetRequest;
    const results: RunSheetResponse["results"] = [];

    for (const cell of req.cells) {
      const start = Date.now();
      try {
        // Demo implementation: return sample dataset for any SQL/expression cell; echo others.
        let value: unknown = null;
        if (cell.kind === "sql" || cell.kind === "expression") {
          value = sampleData;
        } else {
          value = { echoed: cell.expression };
        }
        const durationMs = Date.now() - start;
        results.push({ ref: cell.ref, status: "ok", value: mapDataSetSummary(value), durationMs });
      } catch (err) {
        const durationMs = Date.now() - start;
        results.push({
          ref: cell.ref,
          status: "error",
          error: err instanceof Error ? err.message : String(err),
          durationMs,
        });
      }
    }

    return { results } satisfies RunSheetResponse;
  });

  return app;
}

const app = createApp();
const port = Number(process.env.PORT ?? 4174);
app.listen(port);
console.log(`web-server listening on http://localhost:${port}`);

export type WebServer = ReturnType<typeof createApp>;
export { createApp };
