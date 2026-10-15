const modifiers = ["Ctrl", "Alt", "Shift", "Meta"];
const aliases = {
  control: "Ctrl",
  ctrl: "Ctrl",
  alt: "Alt",
  shift: "Shift",
  meta: "Meta",
  cmd: "Meta",
  space: "Space",
  " ": "Space",
  esc: "Escape",
  escape: "Escape",
  del: "Delete",
  delete: "Delete",
  "−": "-",
  plus: "Plus",
  "+": "Plus",
};
export function normalizeBinding(value, modifierOnly = false) {
  if (!value.trim()) return "";
  if (value.trim() === "+") value = "Plus";
  const parts = value
    .trim()
    .split("+")
    .map((s) => {
      s = s.trim();
      if (!s) throw new Error("Use Plus for the + key.");
      return (
        aliases[s.toLowerCase()] ||
        (s.length === 1
          ? s.toUpperCase()
          : s[0].toUpperCase() + s.slice(1).toLowerCase())
      );
    });
  if (new Set(parts).size !== parts.length)
    throw new Error("A key is repeated.");
  const keys = parts.filter((s) => !modifiers.includes(s));
  if (keys.length > 1)
    throw new Error("Use modifiers and one key, such as Ctrl+Alt or Space.");
  if (!modifierOnly && keys.length !== 1)
    throw new Error("Include a key, such as Ctrl+K.");
  if (
    keys.length &&
    !/^(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4])|Arrow(?:left|right|up|down)|Space|Enter|Escape|Backspace|Delete|Tab|Home|End|Pageup|Pagedown|Plus|[\[\]'?,.\-=;\/])$/.test(
      keys[0],
    )
  )
    throw new Error("Unrecognised key.");
  return [...modifiers.filter((m) => parts.includes(m)), ...keys].join("+");
}
export function eventBinding(event) {
  const key =
    event.key === "+"
      ? "Plus"
      : aliases[event.key?.toLowerCase()] ||
        (event.key?.length === 1
          ? event.key.toUpperCase()
          : event.key?.[0]?.toUpperCase() + event.key?.slice(1).toLowerCase());
  return [
    ...(event.ctrlKey ? ["Ctrl"] : []),
    ...(event.altKey ? ["Alt"] : []),
    ...(event.shiftKey && !["?", "Plus"].includes(key) ? ["Shift"] : []),
    ...(event.metaKey ? ["Meta"] : []),
    ...(!modifiers.includes(key) && key ? [key] : []),
  ].join("+");
}
export const gestureDefinitions = [
  ["pan", "Temporary Hand", "Space", "Navigation"],
  ["sample", "Temporary Eyedropper", "Alt", "Painting"],
  ["brush-size", "Adjust size by dragging", "Ctrl+Alt", "Painting"],
  ["straight", "Connect previous stroke endpoint", "Shift", "Painting"],
  ["straight-angle", "Snap connecting line angle", "Ctrl", "Painting"],
  ["select-add", "Add to selection", "Shift", "Selection"],
  ["select-subtract", "Subtract from selection", "Alt+Shift", "Selection"],
  ["select-intersect", "Intersect selection", "Ctrl+Shift", "Selection"],
  ["layer-contents", "Select layer contents", "Ctrl", "Layers"],
  ["constrain", "Constrain shape proportions / line angle", "Shift", "Shapes"],
  ["from-center", "Draw from centre", "Ctrl", "Shapes"],
  ["move-origin", "Move shape origin while drawing", "Space", "Shapes"],
  ["move-axis", "Constrain movement axis", "Shift", "Moving"],
  ["copy-selection", "Copy selection when starting a drag", "Ctrl", "Moving"],
  ["resize-aspect", "Maintain aspect while resizing", "Shift", "Resizing"],
  ["resize-center", "Resize from centre", "Alt", "Resizing"],
  ["rotate-angle", "Snap rotation angle", "Shift", "Rotating"],
  ["break-handle", "Break linked curve handle", "Alt", "Nodes"],
  [
    "snap-bypass",
    "Reverse snapping while moving / bypass elsewhere",
    "Alt",
    "Grid",
  ],
  ["sample-outline", "Sample outline", "Shift", "Sampling"],
  ["zoom-out", "Zoom tool: zoom out", "Alt", "Zoom"],
  ["wheel-zoom", "Zoom with mouse wheel", "Ctrl", "Navigation"],
  ["nudge-fast", "Nudge ten steps", "Shift", "Nudging"],
].map(([id, label, binding, context]) => ({
  id: `gesture:${id}`,
  label,
  binding,
  context,
  group: "Gestures",
  modifierOnly: true,
}));

export function createBindings(definitions, overrides = {}) {
  const held = new Set();
  const values = Object.fromEntries(
    definitions.map((d) => [d.id, overrides[d.id] ?? d.binding ?? ""]),
  );
  const get = (id) => values[id] || "";
  const track = (event, down) => {
    const key = eventBinding({ key: event.key }).split("+").at(-1);
    if (down) held.add(key);
    else held.delete(key);
  };
  const matches = (id, event = {}, exact = false) => {
    const binding = get(id);
    if (!binding) return false;
    const wants = binding.split("+");
    const pressed = {
      Ctrl: !!(event.ctrlKey || event.metaKey),
      Alt: !!event.altKey,
      Shift: !!event.shiftKey,
      Meta: !!event.metaKey,
    };
    return (
      wants.every((key) =>
        modifiers.includes(key)
          ? pressed[key]
          : event.heldKeys
            ? event.heldKeys.includes(key)
            : held.has(key),
      ) &&
      (!exact ||
        modifiers.every(
          (key) => key === "Meta" || pressed[key] === wants.includes(key),
        ))
    );
  };
  return {
    get,
    values,
    track,
    heldKeys: () => [...held],
    without(id, event) {
      const keys = get(id).split("+");
      return {
        key: event.key,
        ctrlKey: event.ctrlKey && !keys.includes("Ctrl"),
        metaKey:
          event.metaKey && !keys.includes("Ctrl") && !keys.includes("Meta"),
        altKey: event.altKey && !keys.includes("Alt"),
        shiftKey: event.shiftKey && !keys.includes("Shift"),
      };
    },
    clear: () => held.clear(),
    matches,
    action(event) {
      const combo = eventBinding(event).replace(/^Meta(?=\+|$)/, "Ctrl");
      return definitions.find(
        (d) =>
          !d.modifierOnly &&
          get(d.id)
            .split(",")
            .some((b) => b.trim() === combo),
      )?.id;
    },
    selection(event, button = event.button) {
      if (button === 2 || matches("gesture:select-subtract", event, true))
        return "subtract";
      if (matches("gesture:select-intersect", event, true)) return "intersect";
      if (matches("gesture:select-add", event, true)) return "add";
      return "replace";
    },
  };
}

// Earlier Preferences saved every field, including unchanged defaults. Upgrade
// those fields, retain custom assignments, and give custom keys priority over
// new defaults. Later saves contain only overrides, so defaults can evolve.
export const previousBindingDefaults = {
  "tool:select": "V",
  "tool:nudge": "U",
  "tool:bucket": "F",
  "tool:rect": "R",
  "tool:ellipse": "O",
  "export-svg": "",
  "document-setup": "",
  duplicate: "Ctrl+D",
  deselect: "Escape",
  preferences: "",
  "zoom-in": "Plus, =",
  "zoom-out": "-",
  "actual-size": "Ctrl+1",
  snap: "",
  "add-layer": "",
  "selection-layer": "Ctrl+G",
  "flatten-layer": "Ctrl+F",
  "layer-properties": "",
  "flip-h": "",
  "flip-v": "",
  "close-all": "",
};
export function bindingOverrides(definitions, saved = {}, legacy = false) {
  const overrides = {};
  const normalize = (value, definition) =>
    (definition.modifierOnly ? [value] : value.split(","))
      .map((part) => normalizeBinding(part, definition.modifierOnly))
      .filter(Boolean)
      .join(", ");
  for (const definition of definitions) {
    if (typeof saved?.[definition.id] !== "string") continue;
    try {
      const value = normalize(saved[definition.id], definition);
      const original = legacy
        ? (previousBindingDefaults[definition.id] ?? definition.binding ?? "")
        : (definition.binding ?? "");
      if (value !== normalize(original, definition))
        overrides[definition.id] = value;
    } catch {
      // One obsolete or invalid assignment does not discard other preferences.
    }
  }
  const scope = (definition) =>
    definition.modifierOnly ? `gesture:${definition.context}` : "keys";
  const customKeys = new Map();
  for (const definition of definitions) {
    if (!(definition.id in overrides)) continue;
    for (const key of overrides[definition.id].split(", ").filter(Boolean))
      customKeys.set(`${scope(definition)}:${key}`, definition.id);
  }
  for (const definition of definitions) {
    if (definition.id in overrides) continue;
    const value = normalize(definition.binding ?? "", definition);
    const available = value
      .split(", ")
      .filter((key) => !customKeys.has(`${scope(definition)}:${key}`))
      .join(", ");
    if (available !== value) overrides[definition.id] = available;
  }
  return overrides;
}

export function combineSelection(previous, incoming, operation) {
  const candidates = new Set(incoming);
  if (operation === "subtract")
    return previous.filter((id) => !candidates.has(id));
  if (operation === "intersect")
    return previous.filter((id) => candidates.has(id));
  return [
    ...new Set(operation === "add" ? [...previous, ...incoming] : incoming),
  ];
}

export function bindingErrors(definitions, values) {
  const errors = new Map(),
    used = new Map();
  for (const d of definitions) {
    try {
      const bindings = d.modifierOnly
        ? [normalizeBinding(values[d.id] || "", true)]
        : (values[d.id] || "").split(",").map((v) => normalizeBinding(v));
      for (const b of bindings.filter(Boolean)) {
        const scope = d.modifierOnly ? `gesture:${d.context}` : "keys";
        const prior = used.get(`${scope}:${b}`);
        if (prior && prior.id !== d.id) {
          errors.set(d.id, `Also assigned to ${prior.label}.`);
          errors.set(prior.id, `Also assigned to ${d.label}.`);
        } else used.set(`${scope}:${b}`, d);
      }
    } catch (error) {
      errors.set(d.id, error.message);
    }
  }
  return errors;
}
