// The text protocol refscene speaks over the serial port: lines of `tag key=value key="quoted value" ...`.
// Pure functions, so they are tested without a guest.

/** One protocol line to { tag, ...fields }. A bare word after the tag (as in "active none") becomes `word`. */
export function parseLine(line) {
  const space = line.indexOf(' '), tag = space < 0 ? line : line.slice(0, space), fields = { tag };
  const rest = space < 0 ? '' : line.slice(space + 1), pattern = /([\w.]+)=(?:"([^"]*)"|(\S*))|(\S+)/g;
  for (let match; (match = pattern.exec(rest));) {
    if (match[1] === undefined) fields.word = fields.word ? `${fields.word} ${match[4]}` : match[4];
    else fields[match[1]] = match[2] !== undefined ? match[2] : match[3];
  }
  return fields;
}

const rect = value => { const m = /^(-?\d+),(-?\d+),(-?\d+),(-?\d+)$/.exec(value ?? ''); return m ? { x: +m[1], y: +m[2], w: +m[3], h: +m[4] } : null; };
const number = value => value === undefined ? undefined : /^-?\d+$/.test(value) ? +value : value;
const numbers = fields => Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, key === 'text' || key === 'class' || key === 'hwnd' || key === 'parent' || key === 'owner' || key === 'bartext' || key === 'title' ? value : number(value)]));

/** The control fields worth comparing, by window class. Everything else in a `c` line is identification. */
function control(fields) {
  const { tag, hwnd, parent, id, class: cls, cell, enabled, visible, text, rect: r, ...state } = numbers(fields);
  return { hwnd, parent, id, class: cls, cell: cell === '-' ? null : cell, enabled: enabled === 1, visible: visible === 1, text, ...(r ? { rect: rect(r) } : {}), state };
}
const windowOf = fields => fields.word === 'none' ? null : { hwnd: fields.hwnd, id: +fields.id, class: fields.class, text: fields.text, cell: fields.cell === '-' ? null : fields.cell, rect: rect(fields.rect) };

/** The answer to Q as an object: scene, focus, active window, default button, menus, controls, events. */
export function parseState(lines) {
  const state = { controls: [], tops: [], menus: [], events: [] };
  for (const line of lines) {
    const f = parseLine(line);
    if (f.tag === 'q') { const [x, y] = (f.cursor ?? '0,0').split(',').map(Number); Object.assign(state, { scene: +f.scene, ready: f.ready === '1', modal: +f.modal, time: +f.t, cursor: { x, y }, cursorShown: f.shown === '1', capture: f.capture !== '00000000', foreground: f.foreground === '1' }); }
    else if (f.tag === 'active') state.active = windowOf(f);
    else if (f.tag === 'focus') state.focus = windowOf(f);
    else if (f.tag === 'def') state.defaultId = f.has === '1' ? +f.id : null;
    else if (f.tag === 'top') state.tops.push(windowOf(f));
    else if (f.tag === 'menu') state.menu = { loop: f.loop === '1', levels: +f.levels, bar: f.bar === undefined ? null : +f.bar, barText: f.bartext ?? null };
    else if (f.tag === 'ml') state.menus.push({ level: +f.level, name: f.name, highlight: +f.hilite, text: f.text, flags: parseInt(f.flags, 16) });
    else if (f.tag === 'c') state.controls.push(control(f));
    else if (f.tag === 'e') { const { tag, t, word, ...rest } = f; state.events.push({ t: +t, what: word ?? '', ...numbers(rest) }); }
  }
  return state;
}

/** The answer to D as an object: windows with their children and the parts inside them, menus, and template units. */
export function parseDump(lines) {
  const dump = { windows: [], menus: {}, templates: {} }, byHwnd = new Map();
  let last = null;
  for (const line of lines) {
    const f = parseLine(line);
    if (f.tag === 'd') dump.scene = +f.scene;
    else if (f.tag === 'w') { last = { hwnd: f.hwnd, owner: f.owner, class: f.class, cell: f.cell === '-' ? null : f.cell, text: f.text, rect: rect(f.rect), client: rect(f.client), style: f.style, ex: f.ex, children: [], parts: {} }; dump.windows.push(last); byHwnd.set(f.hwnd, last); }
    else if (f.tag === 'c') { const child = { hwnd: f.hwnd, parent: f.parent, id: +f.id, class: f.class, cell: f.cell === '-' ? null : f.cell, text: f.text, rect: rect(f.rect), client: rect(f.client), style: f.style, ex: f.ex, enabled: f.enabled === '1', visible: f.visible === '1', parts: {} }; dump.windows.at(-1)?.children.push(child); byHwnd.set(f.hwnd, child); last = child; }
    else if (f.tag === 'r') {
      for (const [key, value] of Object.entries(f)) {
        if (key === 'tag') continue;
        const dot = key.indexOf('.'), owner = key.slice(0, dot), part = key.slice(dot + 1);
        if (owner === 'menu') { const [name, what] = part.split('.'); (dump.menus[name] ??= { items: [] })[what === 'window' ? 'window' : `rect:${what}`] = rect(value); }
        else if (byHwnd.has(owner)) byHwnd.get(owner).parts[part] = rect(value);
      }
    }
    else if (f.tag === 'm' && f.item !== undefined) (dump.menus[f.name] ??= { items: [] }).items[+f.item] = { id: +f.id, flags: parseInt(f.flags, 16), text: f.text };
    else if (f.tag === 't') dump.templates[f.dialog] = { hwnd: f.hwnd, units: f.units.split(',').map(Number), controls: [] };
    else if (f.tag === 'u') dump.templates[f.dialog]?.controls.push({ id: +f.id, hwnd: f.hwnd, units: rect(f.units), pixels: byHwnd.get(f.hwnd)?.rect ?? null });
  }
  for (const menu of Object.values(dump.menus)) { menu.items.forEach((item, index) => { if (item) item.rect = menu[`rect:item${index}`] ?? null; }); for (const key of Object.keys(menu)) if (key.startsWith('rect:')) delete menu[key]; }
  return dump;
}

/** "[section]" and "key=value" lines of the I answer. */
export function parseInfo(lines) {
  const info = {}; let section = info;
  for (const line of lines) { const head = /^\[(.+)\]$/.exec(line); if (head) { section = info[head[1]] = {}; continue; } const split = line.indexOf('='); if (split > 0) section[line.slice(0, split)] = line.slice(split + 1); }
  return info;
}
