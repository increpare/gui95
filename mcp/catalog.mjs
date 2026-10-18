import { readFile, realpath, readdir } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const textExtensions = new Set([".md", ".css", ".js", ".mjs", ".html", ".svg", ".json", ".txt"]);
const words = (value) => value.toLowerCase().match(/[a-z0-9_-]+/g) ?? [];
const sourceURL = (file) => "https://github.com/increpare/gui95/blob/master/" + file.split("/").map(encodeURIComponent).join("/");

export async function loadCatalog(root) {
  const base = await realpath(root);
  const manifest = JSON.parse(await readFile(path.join(base, "references/snapshot-manifest.json"), "utf8"));
  const names = new Set(["SKILL.md", "README.md", "LICENSE", "THIRD-PARTY-NOTICES.md", "PRIVACY.md"]);
  for (const entry of await readdir(path.join(base, "docs"), { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".md")) names.add("docs/" + entry.name);
  }
  const snapshots = new Map();
  for (const entry of manifest.files) {
    if (textExtensions.has(path.posix.extname(entry.path))) {
      names.add(entry.path);
      snapshots.set(entry.path, entry.sha256);
    }
  }
  const files = new Map();
  const chunks = [];
  for (const name of [...names].sort()) {
    if (name.includes("\\") || path.posix.isAbsolute(name) || name.split("/").includes("..")) throw new Error("Unsafe catalog path.");
    const resolved = await realpath(path.join(base, name));
    if (!resolved.startsWith(base + path.sep)) throw new Error("Catalog file escapes content root.");
    const bytes = await readFile(resolved);
    if (bytes.length > 1024 * 1024) throw new Error("Reference exceeds 1 MiB: " + name);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (snapshots.has(name) && snapshots.get(name) !== sha256) throw new Error("Snapshot hash mismatch: " + name);
    const text = bytes.toString("utf8").replace(/\r\n/g, "\n");
    const lines = text.split("\n");
    const title = lines.find((line) => /^# /.test(line))?.slice(2).trim() ?? name;
    files.set(name, { path: name, title, text, lines, sha256, source_url: sourceURL(name) });
    let heading = title;
    for (let start = 0; start < lines.length; start += 40) {
      const selected = lines.slice(start, start + 50);
      for (const line of selected) if (/^#{1,4} /.test(line)) heading = line.replace(/^#+ /, "").trim();
      const excerpt = selected.join("\n");
      chunks.push({ path: name, heading, start_line: start + 1, end_line: Math.min(start + 50, lines.length), excerpt, tokens: words(excerpt), titleTokens: words(name + " " + heading) });
    }
  }
  const revision = createHash("sha256").update([...files.values()].map((file) => file.path + ":" + file.sha256).join("\n")).digest("hex");
  return {
    revision,
    files,
    search(query, limit = 5) {
      const terms = [...new Set(words(query))].filter((term) => term.length > 1);
      if (!terms.length) return [];
      return chunks.map((chunk) => {
        let matches = 0;
        let score = 0;
        for (const term of terms) {
          const count = chunk.tokens.filter((word) => word.includes(term)).length;
          const titleMatch = chunk.titleTokens.some((word) => word.includes(term));
          if (count || titleMatch) matches++;
          score += Math.min(count, 5) + (titleMatch ? 8 : 0);
        }
        return { ...chunk, score: score ? score + matches * 4 + (chunk.path.startsWith("docs/") ? 3 : 0) : 0 };
      }).filter((chunk) => chunk.score > 0).sort((a, b) => b.score - a.score || a.path.localeCompare(b.path) || a.start_line - b.start_line)
        .slice(0, limit).map(({ tokens, titleTokens, score, excerpt, ...chunk }) => ({
          ...chunk, excerpt: excerpt.slice(0, 6000), source_url: files.get(chunk.path).source_url, sha256: files.get(chunk.path).sha256
        }));
    },
    read(name, start = 1, count = 100) {
      const file = files.get(name);
      if (!file) throw new Error("Unknown reference. Use a path returned by search_gui95.");
      if (!Number.isInteger(start) || start < 1 || start > file.lines.length || !Number.isInteger(count) || count < 1 || count > 200) throw new Error("Invalid line range.");
      const selected = [];
      let length = 0;
      for (const line of file.lines.slice(start - 1, start - 1 + count)) {
        if (length + line.length + 1 > 24000 && selected.length) break;
        selected.push(line.slice(0, 24000));
        length += line.length + 1;
      }
      return { path: name, title: file.title, start_line: start, end_line: start + selected.length - 1, total_lines: file.lines.length,
        text: selected.join("\n"), truncated_line: file.lines.slice(start - 1, start - 1 + selected.length).some((line) => line.length > 24000),
        sha256: file.sha256, source_url: file.source_url,
        next_line: start + selected.length <= file.lines.length ? start + selected.length : null };
    }
  };
}
