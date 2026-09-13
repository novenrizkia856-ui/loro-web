// Tiny static server for local development. No dependencies.
// Mirrors vercel.json cleanUrls: /app serves app.html.
//
//   node tools/serve.mjs [port]

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.argv[2] || process.env.PORT || 5199);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".md": "text/plain; charset=utf-8"
};

async function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0]);
  const target = resolve(root, "." + clean);
  if (target !== root && !target.startsWith(root + sep)) return null;
  const candidates = clean.endsWith("/")
    ? [resolve(target, "index.html")]
    : [target, target + ".html"];
  for (const file of candidates) {
    try {
      if ((await stat(file)).isFile()) return file;
    } catch { /* try the next candidate */ }
  }
  return null;
}

createServer(async (req, res) => {
  const file = await resolveFile(req.url || "/");
  if (!file) {
    res.writeHead(404, { "content-type": "text/plain" });
    return res.end("Not found");
  }
  res.writeHead(200, {
    "content-type": TYPES[extname(file)] || "application/octet-stream",
    "cache-control": "no-store"
  });
  res.end(await readFile(file));
}).listen(port, () => console.log(`Loro site on http://localhost:${port}`));
