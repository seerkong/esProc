import { join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, "..");
const distDir = join(__dirname, "dist");
const entry = join(__dirname, "demo.ts");
const indexFile = join(__dirname, "index.html");

await Bun.build({
  entrypoints: [entry],
  outdir: distDir,
  target: "browser",
  format: "esm",
  sourcemap: "inline",
  loader: {
    ".css": "css",
  },
});

const server = Bun.serve({
  port: 4173,
  fetch: async (req) => {
    const url = new URL(req.url);
    if (url.pathname === "/") {
      return new Response(Bun.file(indexFile), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    if (url.pathname.startsWith("/dist/")) {
      const file = Bun.file(join(__dirname, url.pathname));
      return new Response(file, { headers: { "Content-Type": "application/javascript; charset=utf-8" } });
    }
    return new Response("Not found", { status: 404 });
  },
});

console.log(`Web IDE debug server running at http://localhost:${server.port}`);
