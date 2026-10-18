import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { feedbackWarning } from "./store.mjs";

const kind = process.argv[2];
if (!["feedback", "usage"].includes(kind)) throw new Error("Use: node admin.mjs feedback|usage [--since YYYY-MM-DD]");
const sinceIndex = process.argv.indexOf("--since");
const since = sinceIndex < 0 ? "0000-00-00" : process.argv[sinceIndex + 1];
if (!/^\d{4}-\d{2}-\d{2}$/.test(since ?? "")) throw new Error("Invalid --since date.");
const directory = process.env.GUI95_STATE_DIR ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "var");
if (kind === "feedback") console.error(feedbackWarning);
for (const name of (await readdir(directory)).sort()) {
  const match = new RegExp("^" + kind + "-(\\d{4}-\\d{2}-\\d{2})\\.(?:jsonl|json)$").exec(name);
  if (match && match[1] >= since) process.stdout.write(await readFile(path.join(directory, name), "utf8"));
}
