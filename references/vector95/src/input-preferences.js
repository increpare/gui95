import { esc } from "./core.js";
import { bindingErrors, normalizeBinding } from "./input-bindings.js";

export function preferencesFields(definitions, values) {
  return `<p>Change tools, commands and canvas modifiers. Separate alternative shortcuts with commas. Leave a field empty to unassign it.</p><label class="binding-search">Find an action<input id="binding-search" type="search" autocomplete="off"/></label><div class="binding-list">${definitions.map((d) => `<label class="binding-row" data-binding-row="${esc(d.id)}"><span><strong>${esc(d.label)}</strong><small>${esc(d.group)}${d.context ? ` · ${esc(d.context)}` : ""}</small></span><input data-binding="${esc(d.id)}" aria-label="${esc(d.label)} binding" value="${esc(values[d.id] || "")}" autocomplete="off" spellcheck="false"/><span class="binding-error" aria-live="polite"></span></label>`).join("")}</div><p id="binding-feedback" aria-live="polite"></p><button type="button" id="bindings-reset">Restore Defaults</button>`;
}

export function attachPreferences(root, definitions, initial, applyButton) {
  const values = { ...initial };
  const validate = () => {
    const errors = bindingErrors(definitions, values);
    for (const row of root.querySelectorAll("[data-binding-row]")) {
      const message = errors.get(row.dataset.bindingRow) || "";
      row.querySelector(".binding-error").textContent = message;
      row
        .querySelector("input")
        .setAttribute("aria-invalid", String(!!message));
    }
    applyButton.disabled = errors.size > 0;
    root.querySelector("#binding-feedback").textContent = errors.size
      ? "Resolve the highlighted bindings before applying."
      : "";
  };
  root.querySelector("#binding-search").addEventListener("input", (event) => {
    const term = event.target.value.toLowerCase();
    for (const row of root.querySelectorAll("[data-binding-row]")) {
      row.hidden =
        !row.textContent.toLowerCase().includes(term) &&
        !row.querySelector("input").value.toLowerCase().includes(term);
    }
  });
  for (const input of root.querySelectorAll("[data-binding]"))
    input.addEventListener("input", () => {
      values[input.dataset.binding] = input.value;
      validate();
    });
  root.querySelector("#bindings-reset").addEventListener("click", () => {
    for (const d of definitions) values[d.id] = d.binding || "";
    for (const input of root.querySelectorAll("[data-binding]"))
      input.value = values[input.dataset.binding];
    validate();
  });
  validate();
  return () =>
    Object.fromEntries(
      definitions.map((d) => [
        d.id,
        d.modifierOnly
          ? normalizeBinding(values[d.id] || "", true)
          : (values[d.id] || "")
              .split(",")
              .map((v) => normalizeBinding(v))
              .filter(Boolean)
              .join(", "),
      ]),
    );
}
