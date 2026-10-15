import { esc } from "./core.js";

export const commandLabel = (label) =>
  label
    .replace(/&&/g, "\u0000")
    .replace(/&/g, "")
    .replace(/\u0000/g, "&");

export function menuCommandCatalog(definitions, shortcut, state) {
  const commands = [];
  function collect(entries, path) {
    for (const entry of entries) {
      if (!entry) continue;
      const [label, action, fallback = "", , children] = entry;
      const parts = [...path, commandLabel(label)];
      if (children) collect(children, parts);
      else
        commands.push({
          action,
          label: parts.at(-1),
          path: parts,
          shortcut: shortcut?.(action, fallback) ?? fallback,
          enabled: state(action).enabled !== false,
          checked: !!state(action).checked,
        });
    }
  }
  for (const [name, definition] of Object.entries(definitions))
    collect(typeof definition === "function" ? definition() : definition, [
      name,
    ]);
  return commands;
}

export function findMenuCommands(commands, query) {
  const normalize = (text) =>
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  const term = normalize(query),
    words = term.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const rank = (command) => {
    const label = normalize(command.label);
    return label === term
      ? 0
      : label.startsWith(term)
        ? 1
        : label.includes(term)
          ? 2
          : 3;
  };
  return commands
    .filter((command) => {
      const text = normalize(`${command.path.join(" ")} ${command.shortcut}`);
      return words.every((word) => text.includes(word));
    })
    .sort((a, b) => rank(a) - rank(b));
}

export function searchResultsMarkup(commands) {
  return commands
    .map((command) => {
      const path = command.path.join(" → ");
      return `<div class="command-search-result"><button type="button" class="command-search-run" data-search-action="${esc(command.action)}" aria-label="${esc(path)}" ${command.enabled ? "" : "disabled"}><span><strong>${command.checked ? "✓ " : ""}${esc(command.label)}</strong><small>${esc(path)}${command.enabled ? "" : " · Unavailable"}</small></span><kbd>${esc(command.shortcut)}</kbd></button><button type="button" class="command-search-reveal" data-search-reveal="${esc(command.action)}" aria-label="Show ${esc(path)} in menu" title="Show in menu">→</button></div>`;
    })
    .join("");
}
