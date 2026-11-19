// What the audit compares for each of the 38 examples: which real capture is its counterpart, which rectangles pair
// with which, which layout numbers, and which recorded behaviour is replayed with which element standing for which
// real control. See engine.mjs for the vocabulary. Order follows demo/dist/widgets/manifest.json.
//
// Selectors are CSS, with "@n" for the n-th match. A real locator names a capture of tools/win95-reference
// (measurements/scenes.json) and a control in it, or a cell of the earlier refgrid capture ({ grid }).

const form = (id, extra = {}) => ({ capture: 'form', id, ...extra });
const NATO = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliet', 'Kilo', 'Lima', 'Mike', 'November', 'Oscar', 'Papa', 'Quebec', 'Romeo', 'Sierra', 'Tango', 'Uniform', 'Victor', 'Whiskey', 'Xray', 'Yankee', 'Zulu'];

/* ---- helpers shared by the behaviour specs ---------------------------------------------------------------- */

const clearResult = page => page.evaluate(() => { const r = document.querySelector('#result'); if (r) r.textContent = ''; });
const resultText = page => page.locator('#result').textContent();
/** Ids of the WM_COMMAND clicks a real step produced (button clicks and menu commands, not edit or list notifications). */
const commands = state => state.events.filter(e => e.what === 'command' && (e.code === 0 || e.code === undefined)).map(e => e.id);
/** Which mapped push button is drawn as the default: the real one by its style, the example's by the black frame the kit draws. */
const realDefaultLook = (state, keys) => keys.find(key => state.controls[key]?.type === 'defpush') ?? null;
const exampleDefaultLook = (page, map) => page.evaluate(map => { for (const [key, sel] of Object.entries(map)) { const el = document.querySelector(sel); if (el && getComputedStyle(el).boxShadow.startsWith('rgb(0, 0, 0) 0px 0px 0px 1px inset')) return key; } return null; }, map);
/** Refill a native list with the recording's 26 items, so the same keys mean the same thing on both sides. */
const refill = (page, sel) => page.evaluate(({ sel, items }) => { const el = document.querySelector(sel); el.replaceChildren(...items.map(text => { const o = document.createElement('option'); o.textContent = text; return o; })); el.selectedIndex = -1; }, { sel, items: NATO });
const clean = text => (text ?? '').replace(/&/g, '').replace(/\t.*$/, '').replace(/\s+Ctrl\+\w$/, '').replace(/…/g, '...').replace(/\s+/g, ' ').trim();

export default [
  {
    id: 'buttons',
    visual: [{
      pairs: [
        { name: 'default button', sel: 'button.default', real: form(1), note: 'OK in the real dialog while the focus is in the text box.' },
        { name: 'push button', sel: 'button[type=reset]', real: form(2) },
        { name: 'unavailable button', sel: 'button[disabled]', real: { capture: 'propsheet', id: 12321 }, note: 'Apply in the real property sheet before anything has changed.' },
        { name: 'text box', sel: '#name', real: form(101) }
      ],
      metrics: [['space between two buttons in a row', 'gap-x', 'default button', 'push button'], ['button height', 'height', 'push button'], ['button width', 'width', 'push button'], ['text box height', 'height', 'text box']]
    }],
    behaviour: [{
      name: 'Enter and Space', script: 'dialog-buttons', steps: [1, 5, 6, 16], sync: true,
      controls: { 'Edit#101': { sel: '#name', type: 'push' }, 'Button#1': { sel: 'button.default', type: 'push' }, 'Button#102': { sel: 'button[type=reset]', type: 'push' } },
      before: clearResult,
      real: state => ({ ran: commands(state).map(id => ({ 1: 'default button', 102: 'other button' }[id] ?? id)), defaultLook: realDefaultLook(state, ['Button#1', 'Button#102']) }),
      example: async page => ({ ran: [(t => /Created/.test(t) ? 'default button' : /Reset/.test(t) ? 'other button' : null)(await resultText(page))].filter(Boolean), defaultLook: await exampleDefaultLook(page, { 'Button#1': 'button.default', 'Button#102': 'button[type=reset]' }) })
    }]
  },
  {
    id: 'toggle',
    visual: [{
      pairs: [
        { name: 'latching button, off', sel: '#toggle', real: { capture: 'commctl', cell: 'toggle_off' }, note: 'A push-like check box (BS_PUSHLIKE) is the real latching button.' },
        { name: 'latching button, on and unavailable', sel: 'button[disabled]', real: { capture: 'commctl', cell: 'toggle_on_disabled' }, depth: 2, note: 'Two lines deep: the third pixel in is the dithered face, whose phase depends on where the control sits.' },
        { name: 'latching button, on', sel: 'button[disabled]', real: { grid: 'check_pushlike_checked' }, sides: ['top', 'left', 'bottom', 'right'], note: 'The edges of the latched state, from the earlier refgrid capture (that one is available; the example\'s is not).' }
      ],
      metrics: [['button height', 'height', 'latching button, off']]
    }],
    behaviour: [{
      script: 'toggle-button', steps: { from: 2, to: 7 }, sync: true,
      controls: { toggle_off: { sel: '#toggle', type: 'toggle' }, toggle_on_disabled: { sel: 'button[disabled]', type: 'toggle' } },
      target: step => ({ toggle_off: '#toggle', toggle_on_disabled: 'button[disabled]' }[step.click?.cell] ?? null)
    }]
  },
  {
    id: 'checkbox',
    visual: [{
      pairs: [
        { name: 'unchecked box', sel: '.child@1', real: form(123, { inset: [0, 1, 128, 2] }), ring: 2, note: 'The 13 by 13 box of "Effects". The real control is the box and its label in one window, so the box is cut out of it.' },
        { name: 'checked box', sel: '.child@0', real: form(122, { inset: [0, 1, 128, 2] }), ring: 2 },
        { name: 'mixed box', sel: '#all', real: form(121, { inset: [0, 1, 128, 2] }), ring: 2 },
        { name: 'unavailable checked box', sel: 'input[disabled]', real: form(124, { inset: [0, 1, 128, 2] }), ring: 2 },
        { name: 'row: All', sel: 'label:has(#all)', real: form(121), layoutOnly: true },
        { name: 'row: Music', sel: 'label:has(.child)@0', real: form(122), layoutOnly: true },
        { name: 'row: Effects', sel: 'label:has(.child)@1', real: form(123), layoutOnly: true },
        { name: 'group box', sel: 'fieldset', real: form(120), layoutOnly: true }
      ],
      metrics: [['from the top of one check box row to the next', 'dy', 'row: Music', 'row: Effects'], ['first row below the top of the group box', 'top', 'row: All', 'group box'], ['row in from the left of the group box', 'left', 'row: All', 'group box']]
    }],
    behaviour: [{
      script: 'checkbox-states', steps: { from: 2, to: 20 }, sync: true,
      controls: { 'Button#121': { sel: '#all', type: 'check' }, 'Button#122': { sel: '.child@0', type: 'check' }, 'Button#123': { sel: '.child@1', type: 'check' }, 'Button#124': { sel: 'input[disabled]', type: 'check' } },
      target: step => { const sel = { 123: 'label:has(.child)@1', 124: 'label:has(input[disabled])' }[(step.click ?? step.move)?.control]; return sel ? { sel, dy: step.move?.dy ?? 0 } : null; }
    }]
  },
  {
    id: 'radio',
    visual: [{
      pairs: [
        { name: 'selected option', sel: 'input[value=Draft]', inset: [1, 0, 0, 1], real: form(111, { inset: [1, 1, 119, 3] }), ring: 2, note: 'The 12 by 12 circle of "Draft", cut out of the real control; Windows draws it at the top right of a 13 by 13 square, as the kit does.' },
        { name: 'unselected option', sel: 'input[value=Normal]', inset: [1, 0, 0, 1], real: form(112, { inset: [1, 1, 119, 3] }), ring: 2 },
        { name: 'unavailable option', sel: 'input[disabled]', inset: [1, 0, 0, 1], real: form(114, { inset: [1, 1, 119, 3] }), ring: 2 },
        { name: 'row: Draft', sel: 'label:has(input[value=Draft])', real: form(111), layoutOnly: true },
        { name: 'row: Normal', sel: 'label:has(input[value=Normal])', real: form(112), layoutOnly: true },
        { name: 'group box', sel: 'fieldset', real: form(110), layoutOnly: true }
      ],
      metrics: [['from the top of one option row to the next', 'dy', 'row: Draft', 'row: Normal'], ['first row below the top of the group box', 'top', 'row: Draft', 'group box'], ['row in from the left of the group box', 'left', 'row: Draft', 'group box']]
    }],
    behaviour: [{
      script: 'dialog-option-group', steps: { from: 3, to: 10 }, sync: true,
      controls: { 'Button#111': { sel: 'input[value=Draft]', type: 'radio' }, 'Button#112': { sel: 'input[value=Normal]', type: 'radio' }, 'Button#113': { sel: 'input[value=Best]', type: 'radio' }, 'Button#114': { sel: 'input[disabled]', type: 'radio' } }
    }]
  },
  {
    id: 'text',
    visual: [{
      pairs: [
        { name: 'text box', sel: '#name', real: form(101) },
        { name: 'read-only text box', sel: 'input[readonly]', real: { grid: 'edit_readonly' } },
        { name: 'unavailable text box', sel: 'input[disabled]', real: { grid: 'edit_disabled' } },
        { name: 'default button', sel: 'button.default', real: form(1) }
      ],
      metrics: [['text box height', 'height', 'text box']]
    }],
    behaviour: [{
      script: 'edit-keys', steps: { from: 2, to: 22 }, sync: true, ctrl: 'ControlOrMeta',
      controls: { edit_single: { sel: '#name', type: 'edit' } },
      setup: async page => { await page.locator('#name').focus(); }
    }]
  },
  {
    id: 'multiline',
    visual: [{
      pairs: [{ name: 'multi-line text box', sel: '#notes', real: { capture: 'lists', cell: 'edit_multi' }, sides: ['top', 'left'], note: 'The real box has both scroll bars; only the top and left edges are comparable.' }]
    }],
    behaviour: [{
      script: 'edit-keys', steps: { from: 26, to: 31 }, ctrl: 'ControlOrMeta', focus: false,
      setup: async page => { await page.evaluate(lines => { const el = document.querySelector('#notes'); el.value = lines; el.focus(); el.setSelectionRange(0, 0); }, NATO.map((w, i) => `${w} is line ${i + 1} of this longer text, which wraps.\n`).join('')); },
      // The recording counts a line break as two characters (CR LF) and the browser as one; positions are compared as line and column.
      real: state => { const text = NATO.map((w, i) => `${w} is line ${i + 1} of this longer text, which wraps.\r\n`).join(''), at = n => { const before = text.slice(0, n).split('\r\n'); return `line ${before.length}, column ${before.at(-1).length}`; }; const [a, b] = String(state.controls.edit_multi_long.sel).split(',').map(Number); return { selectionStart: at(a), selectionEnd: at(b) }; },
      example: page => page.evaluate(() => { const el = document.querySelector('#notes'), at = n => { const before = el.value.slice(0, n).split('\n'); return `line ${before.length}, column ${before.at(-1).length}`; }; return { selectionStart: at(el.selectionStart), selectionEnd: at(el.selectionEnd) }; })
    }]
  },
  {
    id: 'spinner',
    visual: [{
      pairs: [
        { name: 'number box', sel: '#copies', real: { capture: 'commctl', cell: 'updown', class: 'Edit' }, sides: ['top', 'left', 'bottom'], note: 'The up-down control sits inside the right end of the real text box.' },
        { name: 'up button', sel: '[data-gui95-delta="1"]', real: { capture: 'commctl', cell: 'updown', class: 'msctls_updown32', inset: [0, 0, 0, 12] }, ring: 2, note: 'The upper half of the real up-down control.' },
        { name: 'both buttons', sel: page => page.evaluate(() => { const a = document.querySelector('[data-gui95-delta="1"]').getBoundingClientRect(), b = document.querySelector('[data-gui95-delta="-1"]').getBoundingClientRect(); return { x: a.left, y: a.top, w: a.width, h: b.bottom - a.top }; }), real: { capture: 'commctl', cell: 'updown', class: 'msctls_updown32' }, layoutOnly: true }
      ],
      metrics: [['number box height', 'height', 'number box'], ['up-down width', 'width', 'both buttons'], ['up-down height', 'height', 'both buttons']]
    }],
    behaviour: [{
      script: 'updown-keys', steps: [2, 3, 4, 5, 6, 7, 8, 9, 14, 17, 20, 21, 23, 24, 25], sync: true,
      controls: { updown: { sel: '#copies', type: 'value' } },
      target: step => { const t = step.click ?? step.move; return t?.class === 'msctls_updown32' ? (t.fy < 0.5 ? '[data-gui95-delta="1"]' : '[data-gui95-delta="-1"]') : null; },
      before: async (page, index) => { if (index === 23) await page.mouse.move(...await page.locator('[data-gui95-delta="1"]').boundingBox().then(b => [b.x + b.width / 2, b.y + b.height / 2])); }
    }]
  },
  {
    id: 'select',
    visual: [{
      pairs: [
        { name: 'drop-down list', sel: '#paper', real: form(141) },
        { name: 'unavailable drop-down list', sel: 'select[disabled]', real: { grid: 'combo_droplist_disabled' } }
      ],
      metrics: [['drop-down list height', 'height', 'drop-down list']]
    }],
    behaviour: [{
      name: 'keys with the list closed', script: 'combo-droplist', steps: [2, 3, 4, 15, 16, 24, 25, 26], sync: true,
      controls: { 'ComboBox#141': { sel: '#paper', type: 'select' } },
      setup: async page => { await page.evaluate(() => { document.querySelector('#paper option[disabled]').disabled = false; document.querySelector('#paper option:last-child').textContent = 'Custom'; }); await page.locator('#paper').focus(); }
    }]
  },
  {
    id: 'combobox',
    visual: [{
      pairs: [{ name: 'combo box field', sel: '#combo', real: form(143), sides: ['top', 'left', 'bottom'], note: 'The real editable combo box has a drop-down button at its right end; the example has none.' }],
      metrics: [['field height', 'height', 'combo box field']]
    }],
    behaviour: [{
      script: 'combo-edit', steps: { from: 2, to: 13 }, focus: false,
      setup: async page => { await page.locator('#combo').focus(); await page.evaluate(() => document.querySelector('#combo').select()); },
      real: state => ({ text: state.controls['Edit#1001'].text ?? '', listOpen: state.controls['ComboBox#143'].dropped === 1 }),
      example: page => page.evaluate(() => ({ text: document.querySelector('#combo').value, listOpen: !document.querySelector('#choices').hidden }))
    }]
  },
  {
    id: 'listbox',
    visual: [{
      pairs: [
        { name: 'list box', sel: '#list', real: { capture: 'lists', cell: 'list_single' }, depth: 2 },
        { name: 'selected row', sel: '#list option@0', real: { capture: 'lists', cell: 'list_single', part: 'item0' }, layoutOnly: true },
        { name: 'second row', sel: '#list option@1', real: { capture: 'lists', cell: 'list_single', part: 'item1' }, layoutOnly: true }
      ],
      metrics: [['row height', 'height', 'selected row'], ['from the top of one row to the next', 'dy', 'selected row', 'second row'], ['first row below the top of the list box', 'top', 'selected row', 'list box'], ['row in from the left of the list box', 'left', 'selected row', 'list box']]
    }],
    behaviour: [{
      script: 'listbox-single', steps: { from: 2, to: 22 }, sync: true,
      controls: { list_long: { sel: '#list', type: 'list' } },
      setup: async page => { await refill(page, '#list'); await page.locator('#list').focus(); },
      target: step => step.click?.part ? { sel: `#list option@${step.click.part.replace('item', '')}` } : null
    }]
  },
  {
    id: 'multiselect',
    visual: [{
      pairs: [{ name: 'list box', sel: '#files', real: { capture: 'lists', cell: 'list_extended' }, depth: 2 }, { name: 'row', sel: '#files option@0', real: { capture: 'lists', cell: 'list_extended', part: 'item0' }, layoutOnly: true }],
      metrics: [['row height', 'height', 'row']]
    }],
    behaviour: [{
      script: 'listbox-extended', steps: { from: 2, to: 35 }, guard: true, ctrl: 'ControlOrMeta', focus: false,
      // A native multiple-selection list keeps its own idea of the item the keyboard is on, which a script cannot set, so
      // the steps are replayed in order and a step is compared only when the selection before it was the same on both sides.
      real: state => ({ selected: String(state.controls.list_long_extended.sel) }),
      example: page => page.evaluate(() => ({ selected: [...document.querySelector('#files').options].map((o, i) => o.selected ? i : -1).filter(i => i >= 0).join(',') || 'none' })),
      setup: async page => { await refill(page, '#files'); await page.locator('#files').focus(); },
      target: step => { const t = step.click ?? step.move; return t?.part ? { sel: `#files option@${t.part.replace('item', '')}` } : null; }
    }]
  },
  {
    id: 'groupbox',
    visual: [{
      pairs: [
        { name: 'group box', sel: 'fieldset@0', inset: [0, 0, -1, -1], real: form(110), sides: ['left', 'bottom', 'right'], ink: true, note: 'The top line is broken by the caption, so the other three sides are compared, and where the caption text starts. The kit draws the white line of the etched edge just outside the box, so the example rectangle is one pixel larger to the right and below.' },
        { name: 'unavailable group box', sel: 'fieldset[disabled]', real: form(120), sides: ['left', 'bottom', 'right'], layoutOnly: true, note: 'Windows 95 has no unavailable look for a group box; only the controls inside are dimmed.' }
      ]
    }],
    behaviour: [{
      name: 'a group box is not a Tab stop', script: 'dialog-tab-order', steps: { from: 1, to: 12 }, focus: false,
      setup: async page => { await page.locator('input[name=orientation]').first().focus(); },
      real: state => ({ focusOnAGroupBox: ['Button#110', 'Button#120'].includes(state.focus ? `${state.focus.class}#${state.focus.id}` : '') }),
      example: page => page.evaluate(() => ({ focusOnAGroupBox: document.activeElement?.tagName === 'FIELDSET' }))
    }]
  }  ,
  {
    id: 'slider',
    visual: [{
      pairs: [
        // A pseudo-element has no rectangle a script can read: the size is the kit stylesheet's (11 by 21, on a 4-pixel channel) and the place follows from the value.
        { name: 'slider thumb', sel: page => page.evaluate(() => { const el = document.querySelector('#volume'), r = el.getBoundingClientRect(); return { x: r.left + (el.value - el.min) / (el.max - el.min) * (r.width - 11), y: r.top + Math.ceil((r.height - 4) / 2) - 9, w: 11, h: 21 }; }), real: { capture: 'commctl', cell: 'trackbar_noticks_live', part: 'thumb' }, ring: 2 },
        { name: 'slider channel', sel: page => page.evaluate(() => { const el = document.querySelector('#volume'), r = el.getBoundingClientRect(); return { x: r.left, y: r.top + Math.ceil((r.height - 4) / 2), w: r.width, h: 4 }; }), real: { capture: 'commctl', cell: 'trackbar_noticks_live', part: 'channel' }, sides: ['top', 'bottom'], depth: 2 }
      ],
      metrics: [['thumb width', 'width', 'slider thumb'], ['thumb height', 'height', 'slider thumb'], ['channel height', 'height', 'slider channel'], ['channel below the top of the thumb', 'dy', 'slider thumb', 'slider channel']]
    }],
    behaviour: [
      { name: 'horizontal', script: 'trackbar-keys', steps: { from: 2, to: 12 }, sync: true, controls: { trackbar_live: { sel: '#volume', type: 'range' } }, setup: async page => { await page.locator('#volume').focus(); } },
      { name: 'vertical: which way a key moves the thumb', script: 'trackbar-keys', steps: { from: 14, to: 17 }, focus: false,
        setup: async page => { await page.locator('#balance').focus(); },
        before: async page => { await page.evaluate(() => { const el = document.querySelector('#balance'); el.value = 0; el.dataset.before = el.value; }); },
        // The real control counts from the top; the example's largest value is at the top. What can be compared is which way the thumb goes.
        real: (state, all) => { const d = state.controls.trackbar_vert_live.pos - all[state.index - 1].controls.trackbar_vert_live.pos; return { thumbMoves: d > 0 ? 'down' : d < 0 ? 'up' : 'not at all' }; },
        example: page => page.evaluate(() => { const el = document.querySelector('#balance'), d = Number(el.value) - Number(el.dataset.before); return { thumbMoves: d < 0 ? 'down' : d > 0 ? 'up' : 'not at all' }; }) }
    ]
  },
  {
    id: 'progress',
    visual: [{
      setup: async page => { await page.locator('#advance').click(); },
      pairs: [{ name: 'progress bar at 25%', sel: '#progress', real: { capture: 'commctl', cell: 'progress_25' }, depth: 1, runs: '#000080', note: 'The runs are the highlight-colour blocks met along the middle row: where each starts and how long it is.' }],
      metrics: [['bar height', 'height', 'progress bar at 25%']]
    }]
  },
  {
    id: 'scrollbars',
    visual: [{
      pairs: [
        { name: 'up arrow button', sel: page => page.evaluate(() => { const r = document.querySelector('.scrollbox').getBoundingClientRect(); return { x: r.right - 1 - 16, y: r.top + 1, w: 16, h: 16 }; }), real: { capture: 'scrollbars', cell: 'vscroll', inset: [0, 0, 0, 204] }, ring: 2, note: 'The top 16 pixels of a real vertical scroll bar control, against the top of the example\'s scroll bar, inside its 1-pixel border.' },
        { name: 'scroll bar width', sel: page => page.evaluate(() => { const el = document.querySelector('.scrollbox'), r = el.getBoundingClientRect(); return { x: r.right - 1 - (el.offsetWidth - el.clientWidth - 2), y: r.top + 1, w: el.offsetWidth - el.clientWidth - 2, h: 16 }; }), real: { capture: 'scrollbars', cell: 'vscroll', inset: [0, 0, 0, 204] }, layoutOnly: true }
      ],
      metrics: [['scroll bar width', 'width', 'scroll bar width']]
    }],
    behaviour: [{
      name: 'clicks on the arrow and in the trough: which way the content goes', script: 'scrollbar', steps: [1, 2, 3, 4], focus: false,
      setup: async page => { await page.evaluate(() => { const el = document.querySelector('.scrollbox'); el.scrollTop = 0; el.dataset.before = 0; }); },
      before: async page => { await page.evaluate(() => { const el = document.querySelector('.scrollbox'); el.dataset.before = el.scrollTop; }); },
      target: step => { const t = step.click; if (!t?.cell || t.cell !== 'vscroll') return null; return t.fy === 1 ? { sel: '.scrollbox', fx: 1, dx: -10, fy: 1, dy: -28 } : t.fy === 0 ? { sel: '.scrollbox', fx: 1, dx: -10, fy: 0, dy: 10 } : { sel: '.scrollbox', fx: 1, dx: -10, fy: 0.75 }; },
      real: (state, all) => { const d = state.controls.vscroll.pos - all[state.index - 1].controls.vscroll.pos; return { contentMoves: d > 0 ? 'down' : d < 0 ? 'up' : 'not at all' }; },
      example: async page => { await page.waitForTimeout(400); return page.evaluate(() => { const el = document.querySelector('.scrollbox'), d = el.scrollTop - Number(el.dataset.before); return { contentMoves: d > 0 ? 'down' : d < 0 ? 'up' : 'not at all' }; }); }
    }]
  },
  {
    id: 'tooltip',
    visual: [{
      setup: async page => { await page.locator('#tool').hover(); await page.waitForTimeout(900); },
      pairs: [{ name: 'tooltip', sel: '#tip', real: { capture: 'commctl-tooltip', class: 'tooltips_class32', window: 'rect' }, depth: 2, note: 'Different words, so different widths; the border and the height are comparable.' }],
      metrics: [['tooltip height', 'height', 'tooltip']]
    }],
    checks: [async function tooltipDelay(page, real) {
      const recording = await real.recording('tooltip'), events = recording.steps.flatMap(s => s.events ?? []).filter(e => e.code === 'ttn_show');
      const first = events.map(e => e.sincemove).filter(ms => ms > 300), second = events.map(e => e.sincemove).filter(ms => ms <= 300);
      const measure = async () => { await page.mouse.move(5, 5); await page.waitForTimeout(300); const box = await page.locator('#tool').boundingBox(); const start = Date.now(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.waitForFunction(() => !document.querySelector('#tip').hidden, null, { timeout: 3000, polling: 10 }); return Date.now() - start; };
      const example = await measure();
      return [{ what: 'time from the pointer coming to rest on a button to the tooltip showing (milliseconds)', real: first, example, agree: first.length > 0 && example >= Math.min(...first) - 80 && example <= Math.max(...first) + 80, note: 'Real: the guest\'s own clock, from the last mouse move to the tooltip\'s show notification, once for each time it appeared; Windows counts the delay on a 55 ms timer. Example: wall clock, polled every 10 ms. Within 80 ms of the real range counts as the same.' },
        { what: 'time to the next tooltip when the pointer moves to a neighbouring button while one is showing (milliseconds)', real: second, example: null, agree: false, note: 'The example has one tooltip only, so there is nothing to compare.' }];
    }]
  },
  {
    id: 'tabs',
    visual: [{
      pairs: [
        { name: 'selected tab', sel: '#tab-general', real: { capture: 'commctl', cell: 'tab_live', part: 'item0', inset: [-2, -2, -2, 0] }, sides: ['top', 'left', 'right'], note: 'TCM_GETITEMRECT gives the inside of a tab; the selected tab is drawn 2 pixels larger on the top, left and right.' },
        { name: 'unselected tab', sel: '#tab-display', real: { capture: 'commctl', cell: 'tab_live', part: 'item1' }, sides: ['top', 'right'] },
        { name: 'tab control', sel: '#tabs', real: { capture: 'commctl', cell: 'tab_live' }, layoutOnly: true },
        { name: 'page area', sel: '#general', real: { capture: 'commctl', cell: 'tab_live', part: 'display', inset: [-4, -4, -4, -4] }, sides: ['left', 'bottom', 'right'], note: 'The display rectangle the real control reports, grown by the 4 pixels it leaves inside its border.' }
      ],
      metrics: [['selected tab height', 'height', 'selected tab'], ['unselected tab height', 'height', 'unselected tab'], ['selected tab stands above its neighbours by', 'dy', 'selected tab', 'unselected tab']]
    }],
    behaviour: [{
      script: 'tab-control', steps: { from: 2, to: 12 }, focus: false,
      setup: async page => { await page.locator('#tab-general').focus(); },
      before: async (page, index, state) => { /* put the example on the tab the real control was on before this step */ },
      guard: true, resync: async (page, state) => { await page.evaluate(n => { const t = document.querySelectorAll('[role=tab]')[n]; t.click(); t.focus(); }, state.controls.tab_live.sel); },
      target: step => step.click?.part ? { sel: `[role=tab]@${step.click.part.replace('item', '')}` } : null,
      real: state => ({ selectedTab: state.controls.tab_live.sel, focusOnTheTabs: state.focus?.cell === 'tab_live' }),
      example: page => page.evaluate(() => ({ selectedTab: [...document.querySelectorAll('[role=tab]')].findIndex(t => t.getAttribute('aria-selected') === 'true'), focusOnTheTabs: document.activeElement?.getAttribute('role') === 'tab' }))
    }]
  },
  {
    id: 'toolbar',
    visual: [{
      pairs: [
        { name: 'toolbar button', sel: '#new', real: { capture: 'commctl', cell: 'toolbar', part: 'button0' }, depth: 2, note: 'The real button holds a 16 by 15 picture and the example a word, so the widths differ.' },
        { name: 'toolbar button, latched', sel: '#snap', real: { capture: 'commctl', cell: 'toolbar', part: 'button4' }, depth: 2 },
        { name: 'toolbar button, unavailable', sel: '#bar button[disabled]', real: { capture: 'commctl', cell: 'toolbar', part: 'button6' }, depth: 2 },
        { name: 'second button', sel: '#save', real: { capture: 'commctl', cell: 'toolbar', part: 'button1' }, layoutOnly: true },
        { name: 'button before the separator', sel: '#save', real: { capture: 'commctl', cell: 'toolbar', part: 'button2' }, layoutOnly: true },
        { name: 'button after the separator', sel: '#grid', real: { capture: 'commctl', cell: 'toolbar', part: 'button4' }, layoutOnly: true },
        { name: 'toolbar', sel: '#bar', real: { capture: 'commctl', cell: 'toolbar' }, layoutOnly: true }
      ],
      metrics: [['button height', 'height', 'toolbar button'], ['space between neighbouring buttons', 'gap-x', 'toolbar button', 'second button'], ['space across a separator', 'gap-x', 'button before the separator', 'button after the separator'], ['button below the top of the toolbar', 'top', 'toolbar button', 'toolbar'], ['first button in from the left of the toolbar', 'left', 'toolbar button', 'toolbar']]
    }],
    behaviour: [{
      name: 'clicking toolbar buttons', script: 'tooltip', steps: [20, 21, 22], focus: false,
      target: step => ({ button4: '#snap', button5: '#grid', button6: '#bar button[disabled]' }[step.click?.part] ?? null),
      real: state => { const flags = Object.fromEntries(String(state.controls.toolbar.buttons).split(',').map(b => b.split(':'))); return { latchedButtonIsDown: (parseInt(flags[3004], 16) & 1) === 1, otherLatchingButtonIsDown: (parseInt(flags[3005], 16) & 1) === 1 }; },
      example: page => page.evaluate(() => ({ latchedButtonIsDown: document.querySelector('#snap').getAttribute('aria-pressed') === 'true', otherLatchingButtonIsDown: document.querySelector('#grid').getAttribute('aria-pressed') === 'true' }))
    }]
  },
  {
    id: 'tree',
    visual: [{
      pairs: [
        { name: 'tree view', sel: '#tree', real: { capture: 'lists', cell: 'tree' }, depth: 2 },
        { name: 'first row', sel: '#tree > li:first-child > [data-gui95-tree-label]', real: { capture: 'lists', cell: 'tree', part: 'text0' }, layoutOnly: true, note: 'The label rectangle: the text and its highlight.' },
        { name: 'second row', sel: '#tree > li:first-child > ul > li:first-child > [data-gui95-tree-label]', real: { capture: 'lists', cell: 'tree', part: 'text1' }, layoutOnly: true }
      ],
      metrics: [['from the top of one row to the next', 'dy', 'first row', 'second row'], ['label height', 'height', 'first row'], ['a child label starts further right than its parent by', 'dx', 'first row', 'second row'], ['first label in from the left of the control', 'left', 'first row', 'tree view'], ['first label below the top of the control', 'top', 'first row', 'tree view']]
    }],
    behaviour: [{
      script: 'tree-keys', steps: { from: 2, to: 25 }, focus: false,
      setup: async page => { await page.locator('#tree > li').first().focus(); },
      // Before each step the example's tree is put into the state the real one was in: which rows show, which are open, which is selected.
      before: async (page, index) => { if (index === 17) await page.waitForTimeout(800); /* let the example's type-ahead buffer empty: the keys before this one were letters to it */ },
      guard: true,
      prepare: async (page, state) => { await page.evaluate(items => {
        const rows = [...document.querySelectorAll('#tree [role=treeitem]')], label = x => x.firstElementChild.lastChild.textContent.trim();
        for (const entry of items.split('|')) { const m = /^(\*?)(\[[-+]\])?(.*)$/.exec(entry), row = rows.find(r => label(r) === m[3]); if (!row) continue;
          if (m[2]) { const open = m[2] === '[-]'; row.setAttribute('aria-expanded', open); row.querySelector(':scope > [role=group]').hidden = !open; row.firstElementChild.querySelector('[data-gui95-disclosure]').textContent = open ? '−' : '+'; }
          if (m[1]) { rows.forEach(r => { r.tabIndex = r === row ? 0 : -1; r.setAttribute('aria-selected', r === row); }); row.focus(); } }
      }, state.controls.tree.items); },
      target: (step, state, before) => { const t = step.click ?? step.dblclick, n = +/\d+/.exec(t.part)[0], name = before.controls.tree.items.split('|')[n].replace(/^\*?(\[[-+]\])?/, ''); return { sel: `#tree [role=treeitem]:has(> [data-gui95-tree-label]:text-is("${name}")) > [data-gui95-tree-label]${t.part.startsWith('row') ? ' > [data-gui95-disclosure]' : ''}`, ...(t.part.startsWith('text') ? { fx: 0.8 } : {}) }; },
      real: state => ({ rows: state.controls.tree.items }),
      example: page => page.evaluate(() => ({ rows: [...document.querySelectorAll('#tree [role=treeitem]')].filter(x => !x.closest('[hidden]')).map(x => `${x.getAttribute('aria-selected') === 'true' ? '*' : ''}${x.hasAttribute('aria-expanded') ? (x.getAttribute('aria-expanded') === 'true' ? '[-]' : '[+]') : ''}${x.firstElementChild.lastChild.textContent.trim()}`).join('|') }))
    }]
  },
  {
    id: 'listview',
    visual: [{
      pairs: [
        { name: 'column heading', sel: '#files th@0', real: { capture: 'lists', class: 'SysHeader32', id: 0, part: 'item0' }, depth: 2 },
        { name: 'list view', sel: '.pane', real: { capture: 'lists', cell: 'listview_report' }, depth: 2 },
        { name: 'first row', sel: '#files tbody tr@0', real: { capture: 'lists', cell: 'listview_report', part: 'item0' }, layoutOnly: true },
        { name: 'second row', sel: '#files tbody tr@1', real: { capture: 'lists', cell: 'listview_report', part: 'item1' }, layoutOnly: true }
      ],
      metrics: [['heading height', 'height', 'column heading'], ['row height', 'height', 'first row'], ['from the top of one row to the next', 'dy', 'first row', 'second row']]
    }],
    behaviour: [
      { name: 'report view: keys', script: 'listview-keys', steps: { from: 2, to: 11 }, focus: false, guard: true,
        setup: async page => { await page.locator('#files tbody tr[aria-selected=true]').focus(); },
        resync: async (page, state) => { const c = state.controls.listview_report, name = c.sel === 'none' ? null : c.order.split('|')[c.sel]; if (name) await page.locator(`#files tbody tr[data-name="${name}"]`).click(); },
        real: state => { const c = state.controls.listview_report; return { selected: c.sel === 'none' ? null : c.order.split('|')[c.sel] }; },
        example: page => page.evaluate(() => ({ selected: document.querySelector('#files tbody tr[aria-selected=true]')?.dataset.name ?? null })) },
      { name: 'report view: sorting by a heading click', script: 'listview-keys', steps: [13, 15, 17], focus: false, guard: true,
        target: step => (step.click.fx < 0.5 ? '#sort-name' : '#sort-size'),
        before: async (page, index) => { if (index === 15) { const b = await page.locator('#sort-name').boundingBox(); await page.mouse.move(b.x + 20, b.y + 8); } },
        real: state => ({ order: state.controls.listview_report.order }),
        example: page => page.evaluate(() => ({ order: [...document.querySelectorAll('#files tbody tr')].map(r => r.dataset.name).join('|') })) },
      { name: 'icon view', script: 'listview-keys', steps: { from: 21, to: 27 }, focus: false, guard: true,
        resync: async (page, state) => { const c = state.controls.listview_icon, name = c.sel === 'none' ? null : c.order.split('|')[c.sel]; if (name) await page.locator(`#files tbody tr[data-name="${name}"]`).click(); },
        setup: async page => { await page.locator('#view').selectOption('icons'); await page.locator('#files tbody tr[aria-selected=true]').focus(); },
        real: state => { const c = state.controls.listview_icon, order = c.order.split('|'); return { selected: c.sel === 'none' ? null : order[c.sel] }; },
        example: page => page.evaluate(() => ({ selected: document.querySelector('#files tbody tr[aria-selected=true]')?.dataset.name ?? null })) }
    ]
  },
  {
    id: 'header',
    visual: [{
      pairs: [
        { name: 'column heading', sel: '#sort', real: { capture: 'commctl', cell: 'header_live', part: 'item0' }, depth: 2 },
        { name: 'header', sel: 'thead tr', real: { capture: 'commctl', cell: 'header_live' }, layoutOnly: true }
      ],
      metrics: [['heading height', 'height', 'column heading']]
    }],
    behaviour: [{
      name: 'dragging a divider', script: 'header', steps: [6, 7, 8, 9, 10, 11, 12, 13], focus: false,
      before: async page => { await page.evaluate(() => { document.querySelector('#column').dataset.before = document.querySelector('#column').getBoundingClientRect().width; }); },
      target: step => { const t = step.move; return t.dx === 1 ? { sel: '#resize' } : t.dx === 31 ? { sel: '#resize', dx: 30 } : { sel: '#column', fx: 0, dx: -4 }; },
      real: (state, all) => { const w = s => +String(s.controls.header_live.widths).split(',')[0]; return { firstColumnChangesBy: w(state) - w(all[state.index - 1]) }; },
      example: page => page.evaluate(() => ({ firstColumnChangesBy: Math.round(document.querySelector('#column').getBoundingClientRect().width - Number(document.querySelector('#column').dataset.before)) }))
    }]
  },
  { id: 'splitter' }  ,
  {
    id: 'menus',
    visual: [
      { name: 'File menu open',
        setup: async page => { await page.locator('#document-name').focus(); await page.keyboard.down('Alt'); await page.keyboard.press('KeyF'); await page.keyboard.up('Alt'); await page.waitForTimeout(100); },
        pairs: [
          { name: 'menu bar title', sel: '#menubar > button@0', real: { capture: 'menu-file', menu: 'bar', item: 0 }, layoutOnly: true },
          { name: 'second menu bar title', sel: '#menubar > button@1', real: { capture: 'menu-file', menu: 'bar', item: 1 }, layoutOnly: true },
          { name: 'drop-down menu', sel: '#file-menu', real: { capture: 'menu-file', menu: 'file', window: true }, depth: 3 },
          { name: 'highlighted command', sel: '#file-menu > button@0', real: { capture: 'menu-file', menu: 'file', item: 0 }, layoutOnly: true },
          { name: 'second command', sel: '#file-menu > button@1', real: { capture: 'menu-file', menu: 'file', item: 1 }, layoutOnly: true },
          { name: 'unavailable command', sel: '#file-menu > button@2', real: { capture: 'menu-file', menu: 'file', item: 2 }, layoutOnly: true },
          { name: 'separator', sel: '#file-menu > hr@0', real: { capture: 'menu-file', menu: 'file', item: 3 }, layoutOnly: true },
          { name: 'command after the separator', sel: '#file-menu > button@3', real: { capture: 'menu-file', menu: 'file', item: 4 }, layoutOnly: true }
        ],
        metrics: [['menu bar title height', 'height', 'menu bar title'], ['command height', 'height', 'second command'], ['from the top of one command to the next', 'dy', 'highlighted command', 'second command'], ['from the command before a separator to the one after it', 'dy', 'unavailable command', 'command after the separator'],
          ['first command below the top of the menu', 'top', 'highlighted command', 'drop-down menu'], ['command in from the left of the menu', 'left', 'highlighted command', 'drop-down menu'], ['menu below the top of its title', 'dy', 'menu bar title', 'drop-down menu'], ['menu left of its title by', 'dx', 'drop-down menu', 'menu bar title']] },
      { name: 'cascading menu open',
        setup: async page => { await page.locator('#document-name').focus(); await page.keyboard.down('Alt'); await page.keyboard.press('KeyV'); await page.keyboard.up('Alt'); await page.keyboard.press('KeyZ'); await page.waitForTimeout(100); },
        pairs: [
          { name: 'parent menu', sel: '#view-menu', real: { capture: 'menu-view-cascade', menu: 'view', window: true }, layoutOnly: true },
          { name: 'cascading item', sel: '#view-menu > button@1', real: { capture: 'menu-view-cascade', menu: 'view', item: 1 }, layoutOnly: true },
          { name: 'cascading menu', sel: '#zoom-menu', real: { capture: 'menu-view-cascade', menu: 'zoom', window: true }, layoutOnly: true }
        ],
        metrics: [['cascading menu overlaps its parent by', 'gap-x', 'parent menu', 'cascading menu'], ['cascading menu above the top of its item by', 'dy', 'cascading menu', 'cascading item']] }
    ],
    behaviour: (() => {
      const names = { 1001: 'New', 1002: 'Open...', 1003: 'Save', 1004: 'Exit', 1011: '1 Letter.txt', 1012: '2 Sketch.bmp', 1031: 'Grid', 1032: '100%', 1033: '200%' };
      const real = state => ({ mode: state.menu.levels ? 'menu open' : state.menu.loop ? 'bar active' : 'none', title: state.menu.loop || state.menu.levels ? clean(state.menu.bar) || null : null, open: state.menu.open.map(m => m.name), highlighted: state.menu.open.map(m => m.highlight < 0 ? null : clean(m.text)), ran: state.events.filter(e => e.what === 'command').map(e => names[e.id] ?? String(e.id)) });
      const example = page => page.evaluate(() => {
        const tidy = t => (t ?? '').replace(/…/g, '...').replace(/ example$/, '').replace(/\s+/g, ' ').trim(), label = b => tidy(b.querySelector(':scope > span:nth-child(2)')?.textContent ?? b.textContent);
        const roots = [...document.querySelectorAll('#menubar > button')], open = [...document.querySelectorAll('[role=menu]')].filter(m => !m.hidden), active = document.activeElement;
        const title = roots.find(b => b === active) ?? roots.find(b => b.getAttribute('aria-expanded') === 'true') ?? null;
        const result = document.querySelector('#result').textContent, ran = /^Command: (.*)$/.exec(result)?.[1] ?? /^(Grid): /.exec(result)?.[1] ?? /^Zoom: (.*)$/.exec(result)?.[1] ?? null;
        return { mode: open.length ? 'menu open' : roots.includes(active) ? 'bar active' : 'none', title: open.length || roots.includes(active) ? tidy(title?.textContent) || null : null, open: open.map(m => m.id.replace('-menu', '')),
          highlighted: open.map(m => { const item = [...m.querySelectorAll(':scope > button')].find(b => b === active) ?? m.querySelector(':scope > button[aria-expanded=true]'); return item ? label(item) : null; }), ran: ran ? [tidy(ran)] : [] };
      });
      // Before each step the example is brought, by its own keyboard interface, to the state the real menus were in:
      // closed; the bar active on a title; or a chain of menus open with the same commands highlighted. A state the
      // example cannot be put into (a menu open with nothing highlighted, a title it does not have) is left, and the
      // guard then reports the step as not comparable.
      const prepare = async (page, before) => {
        const want = real(before), have = await example(page);
        if (JSON.stringify({ ...want, ran: 0 }) === JSON.stringify({ ...have, ran: 0 })) return;
        for (let i = 0; i < 4; i++) await page.keyboard.press('Escape');
        await page.locator('#document-name').focus();
        if (want.mode === 'none' || !['File', 'View'].includes(want.title)) return;
        if (want.mode === 'bar active') { await page.keyboard.press('F10'); if (want.title === 'View') await page.keyboard.press('ArrowRight'); return; }
        await page.keyboard.down('Alt'); await page.keyboard.press(want.title === 'File' ? 'KeyF' : 'KeyV'); await page.keyboard.up('Alt');
        for (const [level, label] of want.highlighted.entries()) {
          if (level > 0) await page.keyboard.press('ArrowRight');
          for (let n = 0; n < 8 && label !== null; n++) { const now = (await example(page)).highlighted[level]; if (now === label || now === undefined) break; await page.keyboard.press('ArrowDown'); }
        }
      };
      const common = { focus: false, guard: true, guardKeys: ['mode', 'title', 'open', 'highlighted'], prepare, real, example, before: clearResult, setup: async page => { await page.locator('#document-name').focus(); } };
      const bar = { 0: 0, 2: 1 };   // the real bar has File, Edit, View, Help; the example File and View
      const target = step => { const t = step.click ?? step.move; if (!t || t === true) return null; if (t.menu === 'bar') return bar[t.item] === undefined ? null : `#menubar > button@${bar[t.item]}`; if (t.menu === 'file') return `#file-menu > :is(button,hr)@${t.item}`; if (t.menu === 'view') return t.item <= 1 ? `#view-menu > button@${t.item}` : null; if (t.menu === 'zoom') return t.item <= 1 ? `#zoom-menu > button@${t.item}` : null; return t.x !== undefined ? '#result' : null; };
      return [
        { ...common, name: 'activating the bar', script: 'menu-activate', steps: [1, 2, 3, 4, 5, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26] },
        { ...common, name: 'arrows in a menu', script: 'menu-arrows', steps: { from: 1, to: 16 } },
        { ...common, name: 'cascading menu and Esc', script: 'menu-cascade', steps: [1, 2, 3, 4, 10, 11, 12, 13, 14] },
        { ...common, name: 'access keys', script: 'menu-mnemonics', steps: [1, 2, 8, 9, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25] },
        { ...common, name: 'shortcut keys', script: 'menu-shortcuts', steps: [1, 2, 3, 4, 5, 6, 7] },
        { ...common, name: 'the mouse', script: 'menu-mouse', steps: [1, 2, 21, 22, 23, 24, 25, 30, 31, 32], target }
      ];
    })(),
    checks: [async function cascadeDelay(page, real) {
      // Real: from the pointer first highlighting the cascading item to the cascading menu being told to open, on the guest's own clock.
      const recording = await real.recording('menu-mouse'), events = recording.steps.flatMap(s => s.events ?? []);
      const delays = []; let rest = null;
      for (const e of events) { if (e.what === 'menuselect' && e.mouse === 1 && /Zoom|Custom/.test(e.text ?? '')) rest ??= e.t; else if (e.what === 'menuselect') rest = null; if (e.what === 'initmenupopup' && (e.menu === 'zoom' || e.menu === 'custom') && rest !== null) { delays.push(e.t - rest); rest = null; } }
      await page.locator('#document-name').focus(); await page.locator('#menubar > button').nth(1).click();
      const box = await page.locator('#view-menu > button').nth(1).boundingBox(), start = Date.now();
      await page.mouse.move(box.x + 20, box.y + 6); await page.mouse.move(box.x + 22, box.y + 7);
      await page.waitForFunction(() => !document.querySelector('#zoom-menu').hidden, null, { timeout: 3000, polling: 10 });
      const example = Date.now() - start;
      return [{ what: 'time from the pointer coming onto a cascading item to its menu opening (milliseconds)', real: delays, example, agree: delays.length > 0 && example >= Math.min(...delays) - 80 && example <= Math.max(...delays) + 80, note: 'Real: one value per cascade opened by resting the pointer in the recording. Example: wall clock, polled every 10 ms.' }];
    }]
  },
  {
    id: 'context-menu',
    visual: [{
      setup: async page => { await page.locator('#context-target').focus(); await page.keyboard.press('Shift+F10'); await page.waitForTimeout(100); },
      pairs: [
        { name: 'pop-up menu', sel: '#context-menu', real: { capture: 'menu-context', menu: 'context', window: true }, depth: 3 },
        { name: 'first command', sel: '#context-menu > button@0', real: { capture: 'menu-context', menu: 'context', item: 0 }, layoutOnly: true },
        { name: 'second command', sel: '#context-menu > button@1', real: { capture: 'menu-context', menu: 'context', item: 1 }, layoutOnly: true }
      ],
      metrics: [['command height', 'height', 'first command'], ['from the top of one command to the next', 'dy', 'first command', 'second command'], ['first command below the top of the menu', 'top', 'first command', 'pop-up menu'], ['menu height', 'height', 'pop-up menu']]
    }],
    behaviour: [{
      script: 'context-menu', steps: { from: 1, to: 23 }, focus: false, guard: true, guardKeys: ['open', 'highlighted'], before: clearResult,
      setup: async page => { await page.locator('#context-target').focus(); },
      // Before each step: closed, or open with the same command highlighted (the example cannot be open with nothing highlighted).
      prepare: async (page, before) => {
        const open = before.menu.levels > 0, label = open && before.menu.open[0].highlight >= 0 ? clean(before.menu.open[0].text) : null;
        const now = () => page.evaluate(() => { const menu = document.querySelector('#context-menu'), item = [...menu.querySelectorAll('button')].find(b => b === document.activeElement); return { open: !menu.hidden, label: item ? item.textContent.replace(/…/g, '...').trim() : null }; });
        let have = await now(); if (have.open === open && have.label === label) return;
        await page.keyboard.press('Escape'); await page.locator('#context-target').focus();
        if (!open) return;
        await page.keyboard.press('Shift+F10');
        for (let n = 0; n < 4 && label !== null; n++) { have = await now(); if (have.label === label) break; await page.keyboard.press('ArrowDown'); }
      },
      target: step => { const t = step.rightclick ?? step.click; return t?.cell === 'frame' ? { sel: '#context-target', fx: t.fx, fy: t.fy } : t?.menu === 'context' ? `#context-menu > button@${t.item}` : t?.x !== undefined ? '#result' : null; },
      real: state => ({ open: state.menu.levels > 0, highlighted: state.menu.open[0] ? (state.menu.open[0].highlight < 0 ? null : clean(state.menu.open[0].text)) : null, ran: state.events.filter(e => e.what === 'command').map(e => ({ 2001: 'Open document', 2002: 'Rename...', 2003: 'Delete (locked)' }[e.id] ?? String(e.id))) }),
      example: page => page.evaluate(() => { const menu = document.querySelector('#context-menu'), tidy = t => (t ?? '').replace(/…/g, '...').replace(/\s+/g, ' ').trim(), item = [...menu.querySelectorAll('button')].find(b => b === document.activeElement), ran = /^Command: (.*)$/.exec(document.querySelector('#result').textContent)?.[1]; return { open: !menu.hidden, highlighted: !menu.hidden && item ? tidy(item.textContent) : null, ran: ran ? [tidy(ran)] : [] }; })
    }]
  }  ,
  {
    id: 'modal',
    visual: [{
      setup: async page => { await page.locator('#show').click(); await page.waitForTimeout(100); },
      pairs: [
        { name: 'dialog window', sel: '#box', real: { capture: 'form', window: 'rect' }, sides: ['top', 'left'], depth: 4, note: 'The real dialog is the one made from the template "form" in tools/win95-reference/refgrid/cells.def: the 1995 guidelines\' numbers in dialog units, turned into pixels by the real dialog manager.' },
        { name: 'client area', sel: '#box > form', real: { capture: 'form', window: 'client' }, layoutOnly: true },
        { name: 'title bar', sel: '#box .title-bar', real: { capture: 'form', window: 'rect', inset: [3, 3, 3, 308] }, layoutOnly: true },
        { name: 'label', sel: '#box label[for=name]', real: form(100), layoutOnly: true },
        { name: 'text box', sel: '#box #name', real: form(101) },
        { name: 'default button', sel: '#box button.default', real: form(1) },
        { name: 'button beside it', sel: '#box button[value=cancel]', real: form(2), layoutOnly: true },
        { name: 'last button', sel: '#box button[value=cancel]', real: form(9) }
      ],
      metrics: [['title bar height', 'height', 'title bar'], ['client area below the top of the window', 'top', 'client area', 'dialog window'], ['client area in from the left of the window', 'left', 'client area', 'dialog window'],
        ['left margin (label from the client area)', 'left', 'label', 'client area'], ['top margin (text box from the client area)', 'top', 'text box', 'client area'], ['label below the top of its text box', 'dy', 'text box', 'label'],
        ['space between buttons', 'gap-x', 'default button', 'button beside it'], ['right margin (last button from the client area)', 'right', 'last button', 'client area'], ['bottom margin (buttons from the client area)', 'bottom', 'last button', 'client area'],
        ['button width', 'width', 'default button'], ['button height', 'height', 'default button'], ['text box height', 'height', 'text box']]
    }],
    behaviour: [
      { name: 'Enter, Space, Esc and which button looks like the default', script: 'dialog-buttons', steps: [1, 16, 17], sync: true, focus: false,
        controls: { 'Edit#101': { sel: '#name', type: 'push' }, 'Button#1': { sel: '#box button.default', type: 'push' }, 'Button#2': { sel: '#box button[value=cancel]', type: 'push' } },
        setup: async page => { await page.locator('#show').click(); },
        // The real dialog stays open after a command (the test program only logs it); the example closes, so it is opened again before each step.
        prepare: async page => { if (!await page.evaluate(() => document.querySelector('#box').open)) await page.locator('#show').click(); },
        before: clearResult,
        real: state => ({ ran: commands(state).map(id => ({ 1: 'default button', 2: 'Cancel' }[id] ?? id)), defaultLook: realDefaultLook(state, ['Button#1', 'Button#2', 'Button#9']) }),
        example: async page => ({ ran: [(t => /rename/.test(t) ? 'default button' : /cancel/.test(t) ? 'Cancel' : null)(await resultText(page))].filter(Boolean), defaultLook: await page.evaluate(() => document.querySelector('#box').open) ? await exampleDefaultLook(page, { 'Button#1': '#box button.default', 'Button#2': '#box button[value=cancel]' }) : 'Button#1' }) },
      { name: 'the default look follows the focus between push buttons', script: 'dialog-tab-order', steps: [10, 15], sync: true,
        controls: { 'Button#1': { sel: '#box button.default', type: 'push' }, 'Button#2': { sel: '#box button[value=cancel]', type: 'push' } },
        setup: async page => { await page.locator('#show').click(); },
        real: state => ({ defaultLook: realDefaultLook(state, ['Button#1', 'Button#2', 'Button#9']) }),
        example: async page => ({ defaultLook: await exampleDefaultLook(page, { 'Button#1': '#box button.default', 'Button#2': '#box button[value=cancel]' }) }) },
      { name: 'Tab from the last control and Shift+Tab from the first', script: 'dialog-tab-order', steps: [12, 13], sync: true,
        controls: { 'Edit#101': { sel: '#name', type: 'push' }, 'Button#9': { sel: '#box button[value=cancel]', type: 'push' } },
        setup: async page => { await page.locator('#show').click(); } }
    ]
  },
  {
    id: 'modeless',
    visual: [{
      setup: async page => { await page.locator('#show').click(); await page.waitForTimeout(100); },
      pairs: [
        { name: 'dialog window', sel: '#box', real: { capture: 'comdlg-find', window: 'rect' }, sides: ['top', 'left'], depth: 4 },
        { name: 'client area', sel: '#find', real: { capture: 'comdlg-find', window: 'client' }, layoutOnly: true },
        { name: 'label', sel: '#box label[for=query]', real: { capture: 'comdlg-find', text: 'Find what:' }, layoutOnly: true },
        { name: 'text box', sel: '#query', real: { capture: 'comdlg-find', id: 1152 } },
        { name: 'check box row', sel: 'label:has(#case)', real: { capture: 'comdlg-find', id: 1041 }, layoutOnly: true },
        { name: 'default button', sel: '#box button.default', real: { capture: 'comdlg-find', id: 1 } },
        { name: 'button below it', sel: '#close', real: { capture: 'comdlg-find', id: 2 } }
      ],
      metrics: [['left margin (label from the client area)', 'left', 'label', 'client area'], ['top margin (text box from the client area)', 'top', 'text box', 'client area'], ['text box height', 'height', 'text box'], ['label below the top of its text box', 'dy', 'text box', 'label'],
        ['text box to the column of buttons', 'gap-x', 'text box', 'default button'], ['space between the stacked buttons', 'gap-y', 'default button', 'button below it'], ['right margin (buttons from the client area)', 'right', 'default button', 'client area'], ['top margin (first button from the client area)', 'top', 'default button', 'client area'], ['button width', 'width', 'default button'], ['button height', 'height', 'default button']]
    }],
    behaviour: [{
      script: 'find-dialog', steps: [1, 13], focus: false,
      setup: async page => { await page.locator('#show').click(); },
      prepare: async page => { await page.locator('#query').focus(); },
      before: clearResult,
      real: state => ({ findRequested: state.events.some(e => e.findnext === 1), dialogOpen: state.active?.text === 'Find' }),
      example: async page => ({ findRequested: /Found|not found/.test(await resultText(page)), dialogOpen: await page.evaluate(() => document.querySelector('#box').open) })
    }]
  },
  {
    id: 'properties',
    visual: [{
      setup: async page => { await page.locator('#show').click(); await page.waitForTimeout(100); },
      pairs: [
        { name: 'property sheet window', sel: '#box', real: { capture: 'propsheet', window: 'rect' }, sides: ['top', 'left'], depth: 4 },
        { name: 'client area', sel: '#box > [data-gui95-dialog-layout]', real: { capture: 'propsheet', window: 'client' }, layoutOnly: true },
        { name: 'tab control', sel: '#tabs', real: { capture: 'propsheet', id: 12320 }, layoutOnly: true },
        { name: 'page', sel: '#general-panel', real: { capture: 'propsheet', id: 0, class: '#32770' }, layoutOnly: true },
        { name: 'selected tab', sel: '#general-tab', real: { capture: 'propsheet', id: 12320, part: 'item0', inset: [-2, -2, -2, 0] }, sides: ['top', 'left', 'right'] },
        { name: 'label', sel: '#box label[for=name]', real: { capture: 'propsheet', id: 200 }, layoutOnly: true },
        { name: 'text box', sel: '#box #name', real: { capture: 'propsheet', id: 201 } },
        { name: 'OK', sel: '#ok', real: { capture: 'propsheet', id: 1 } },
        { name: 'Cancel', sel: '#cancel', real: { capture: 'propsheet', id: 2 } },
        { name: 'Apply, unavailable', sel: '#apply', real: { capture: 'propsheet', id: 12321 } }
      ],
      metrics: [['tab control in from the left of the client area', 'left', 'tab control', 'client area'], ['tab control below the top of the client area', 'top', 'tab control', 'client area'], ['page width', 'width', 'page'], ['page height', 'height', 'page'],
        ['label in from the left of the page', 'left', 'label', 'page'], ['text box below the top of the page', 'top', 'text box', 'page'], ['tab control to the row of buttons', 'gap-y', 'tab control', 'OK'],
        ['space between OK and Cancel', 'gap-x', 'OK', 'Cancel'], ['space between Cancel and Apply', 'gap-x', 'Cancel', 'Apply, unavailable'], ['right margin (Apply from the client area)', 'right', 'Apply, unavailable', 'client area'], ['bottom margin (buttons from the client area)', 'bottom', 'OK', 'client area'], ['button width', 'width', 'OK'], ['selected tab height', 'height', 'selected tab']]
    }],
    behaviour: (() => {
      const page0 = state => state.controls['SysTabControl32#12320']?.sel ?? null;
      const examplePage = page => page.evaluate(() => [...document.querySelectorAll('#tabs [role=tab]')].findIndex(t => t.getAttribute('aria-selected') === 'true'));
      const reopen = async page => { await page.reload(); await page.evaluate(() => document.body.setAttribute('data-gui95-density', 'period')); await page.locator('#show').click(); await page.evaluate(() => document.querySelector('#name').select()); };
      const kind = state => ({ 'Edit#201': 'first field of the page', 'Button#202': 'second field of the page', 'ComboBox#211': 'first field of the page', 'Button#1': 'OK', 'Button#2': 'Cancel', 'Button#12321': 'Apply', 'SysTabControl32#12320': 'the tabs' }[state.focus ? `${state.focus.class}#${state.focus.id}` : ''] ?? 'elsewhere');
      const exampleKind = page => page.evaluate(() => { const a = document.activeElement; return !a ? 'elsewhere' : a.getAttribute('role') === 'tab' ? 'the tabs' : a.id === 'ok' ? 'OK' : a.id === 'cancel' ? 'Cancel' : a.id === 'apply' ? 'Apply' : a.closest('[role=tabpanel]') ? 'first field of the page' : 'elsewhere'; });
      const focusKind = async (page, want) => { await page.evaluate(want => { const el = want === 'the tabs' ? document.querySelector('#tabs [role=tab][aria-selected=true]') : want === 'OK' ? document.querySelector('#ok') : want === 'Cancel' ? document.querySelector('#cancel') : want === 'first field of the page' ? document.querySelector('#tabs [role=tabpanel]:not([hidden]) :is(input,select)') : null; el?.focus(); }, want); };
      return [
        { name: 'changing page from the keyboard', script: 'propsheet-keys', steps: [1, 2, 3, 4, 5, 6, 7, 8, 13, 14, 15, 16], focus: false, guard: true,
          setup: async page => { await page.locator('#show').click(); },
          prepare: async (page, before) => { await page.evaluate(n => document.querySelectorAll('#tabs [role=tab]')[n].click(), page0(before)); await focusKind(page, kind(before)); },
          real: state => ({ page: page0(state), focusOn: kind(state) }),
          example: async page => ({ page: await examplePage(page), focusOn: await exampleKind(page) }) },
        { name: 'Tab order', script: 'propsheet-keys', steps: [11, 12, 17, 18], focus: false, guard: true,
          setup: async page => { await page.locator('#show').click(); },
          prepare: async (page, before) => { await focusKind(page, kind(before)); },
          real: state => ({ focusOn: kind(state) }), example: async page => ({ focusOn: await exampleKind(page) }) },
        { name: 'Apply, OK, Cancel, Esc and Close', script: 'propsheet-apply', steps: [1, 3, 4, 6, 7, 9, 10, 16, 17, 19], focus: false,
          setup: reopen,
          before: async (page, index, state) => { },
          prepare: async (page, before, all) => {
            if (before.step.scene !== undefined) { await reopen(page); return; }
            // Steps between the compared ones (an Apply by its access key, a change on the second page) are made here by the example's own controls.
            const want = { open: before.active?.text === 'Document Properties', apply: before.controls['Button#12321'] ? before.controls['Button#12321'].enabled !== false : null };
            let have = await page.evaluate(() => ({ open: document.querySelector('#box').open && !document.querySelector('#confirm').open, apply: !document.querySelector('#apply').disabled }));
            if (want.open && !have.open) { await reopen(page); have = { open: true, apply: false }; }
            if (want.open && have.open && want.apply === false && have.apply) await page.locator('#apply').click();
            if (want.open && have.open && want.apply === true && !have.apply) { await page.locator('#name').focus(); await page.keyboard.type('w'); }
            if (want.open && have.open) { await page.locator('#name').focus(); }
          },
          target: step => ({ close: '#caption-close' }[step.click?.window] ?? { Apply: '#apply', Cancel: '#cancel', OK: '#ok' }[step.click?.text] ?? null),
          real: state => ({ sheetOpen: state.active?.text === 'Document Properties', applyAvailable: state.controls['Button#12321'] ? state.controls['Button#12321'].enabled !== false : null, toldToApply: state.events.some(e => e.what === 'applied') }),
          example: async page => page.evaluate(() => { const open = document.querySelector('#box').open; return { sheetOpen: open && !document.querySelector('#confirm').open, applyAvailable: open ? !document.querySelector('#apply').disabled : null, toldToApply: /Applied/.test(document.querySelector('#result').textContent) }; }),
          // each compared step starts with an empty result line
        }
      ].map(b => b.script === 'propsheet-apply' ? { ...b, before: clearResult } : b);
    })()
  },
  {
    id: 'message',
    visual: [{
      setup: async page => { await page.locator('#show').click(); await page.waitForTimeout(100); },
      pairs: [
        { name: 'message box window', sel: '#box', real: { capture: 'msgbox-question-yesno-default2', window: 'rect' }, sides: ['top', 'left'], depth: 4 },
        { name: 'client area', sel: '#box > form', real: { capture: 'msgbox-question-yesno-default2', window: 'client' }, layoutOnly: true },
        { name: 'first button', sel: '#box button[value=delete]', real: { capture: 'msgbox-question-yesno-default2', id: 6 } },
        { name: 'default button (the second)', sel: '#box button[value=cancel]', real: { capture: 'msgbox-question-yesno-default2', id: 7 }, note: 'The real one also has the focus, so it carries the dotted rectangle.' },
        { name: 'message text', sel: '#question', real: { capture: 'msgbox-plain-ok', id: 65535 }, layoutOnly: true, note: 'Against the real message box that has no icon, as the example has none.' },
        { name: 'client area of the box without an icon', sel: '#box > form', real: { capture: 'msgbox-plain-ok', window: 'client' }, layoutOnly: true },
        { name: 'button of the box without an icon', sel: '#box button[value=delete]', real: { capture: 'msgbox-plain-ok', class: 'Button' }, layoutOnly: true }
      ],
      metrics: [['space between buttons', 'gap-x', 'first button', 'default button (the second)'], ['bottom margin (buttons from the client area)', 'bottom', 'first button', 'client area'], ['left of the first button from the client area', 'left', 'first button', 'client area'], ['right of the last button from the client area', 'right', 'default button (the second)', 'client area'],
        ['message text in from the left (no icon)', 'left', 'message text', 'client area of the box without an icon'], ['message text below the top (no icon)', 'top', 'message text', 'client area of the box without an icon'], ['message text to the buttons (no icon)', 'gap-y', 'message text', 'button of the box without an icon'], ['button width', 'width', 'first button'], ['button height', 'height', 'first button']]
    }],
    behaviour: (() => {
      const make = (ids, steps, name) => ({
        name, script: 'msgbox-keys', steps, focus: false, guard: true, guardKeys: ['focusOn'],
        setup: async page => { await page.locator('#show').click(); },
        before: clearResult,
        prepare: async (page, before) => { if (!await page.evaluate(() => document.querySelector('#box').open)) { await clearResult(page); await page.locator('#show').click(); } const want = ids[before.focus?.id]; if (want) await page.locator(want === 'first button' ? '#box button[value=delete]' : '#box button[value=cancel]').focus(); },
        real: state => ({ focusOn: state.active?.text === 'Example' ? ids[state.focus?.id] ?? null : null, closedWith: state.events.filter(e => e.what === 'modal end').map(e => ids[e.result] ?? `result ${e.result}`)[0] ?? null }),
        example: async page => ({ focusOn: await page.evaluate(() => { const a = document.activeElement, open = document.querySelector('#box').open; return !open ? null : a?.value === 'delete' ? 'first button' : a?.value === 'cancel' ? 'second button' : null; }), closedWith: (t => /deleted/.test(t) ? 'first button' : /Kept/.test(t) ? 'second button' : null)(await resultText(page)) })
      });
      return [make({ 6: 'first button', 7: 'second button' }, [22, 24, 25], 'the second button as the default (real: Yes, No with No the default)'), make({ 1: 'first button', 2: 'second button' }, [9, 10, 11, 12, 14], 'arrows, Tab, Enter on the focused button, Esc (real: OK, Cancel)')];
    })()
  },
  {
    id: 'wizard',
    visual: [{
      setup: async page => { await page.locator('#show').click(); await page.waitForTimeout(100); },
      pairs: [
        { name: 'wizard window', sel: '#box', real: { capture: 'wizard', window: 'rect' }, sides: ['top', 'left'], depth: 4 },
        { name: 'client area', sel: '#box > [data-gui95-dialog-layout]', real: { capture: 'wizard', window: 'client' }, layoutOnly: true },
        { name: 'Back', sel: '#back', real: { capture: 'wizard', id: 12323 } },
        { name: 'Next', sel: '#next', real: { capture: 'wizard', id: 12324 } },
        { name: 'Cancel', sel: '#cancel', real: { capture: 'wizard', id: 2 } },
        { name: 'text box', sel: '#box #name', real: { capture: 'wizard', id: 302 } }
      ],
      metrics: [['space between Back and Next', 'gap-x', 'Back', 'Next'], ['space between Next and Cancel', 'gap-x', 'Next', 'Cancel'], ['right margin (Cancel from the client area)', 'right', 'Cancel', 'client area'], ['bottom margin (buttons from the client area)', 'bottom', 'Cancel', 'client area'], ['button width', 'width', 'Next'], ['button height', 'height', 'Next']]
    }],
    behaviour: [{
      script: 'wizard', steps: [1, 2, 3, 4, 5, 6, 7, 9], focus: false, guard: true, guardKeys: ['page', 'open'],
      setup: async page => { await page.locator('#show').click(); },
      // Before each step the example is put on the page the real wizard was on, with the same name typed, using its own Back and Next buttons.
      prepare: async (page, before) => {
        const titles = ['Name', 'Template', 'Review'], want = titles.indexOf(before.active?.text), name = before.controls['Edit#302']?.text;
        if (want < 0) return;
        if (!await page.evaluate(() => document.querySelector('#box').open)) await page.locator('#show').click();
        const at = () => page.evaluate(() => [...document.querySelectorAll('#box [data-step]')].findIndex(s => !s.hidden));
        for (let n = 0; n < 4 && await at() > 0; n++) await page.locator('#back').click();
        await page.evaluate(v => { document.querySelector('#name').value = v ?? document.querySelector('#name').value; }, want === 0 ? (name ?? '') : null);
        if (want > 0 && !await page.evaluate(() => document.querySelector('#name').value)) await page.evaluate(() => { document.querySelector('#name').value = 'demo'; });
        for (let n = 0; n < want; n++) await page.locator('#next').click();
        await page.evaluate(() => { const field = document.querySelector('#box [data-step]:not([hidden]) :is(input,select)'); (field ?? document.querySelector('#next')).focus(); });
      },
      real: state => ({ open: ['Name', 'Template', 'Review'].includes(state.active?.text), page: ['Name', 'Template', 'Review'].indexOf(state.active?.text), finished: state.events.some(e => e.what === 'modal end' && e.result > 0) }),
      example: async page => ({ ...(await page.evaluate(() => { const open = document.querySelector('#box').open; return { open, page: open ? [...document.querySelectorAll('#box [data-step]')].findIndex(s => !s.hidden) : -1 }; })), finished: /Created project/.test(await resultText(page)) })
    }]
  },
  {
    id: 'color',
    visual: [{
      setup: async page => { await page.locator('#show').click(); await page.waitForTimeout(100); },
      pairs: [
        { name: 'dialog window', sel: '#box', real: { capture: 'comdlg-color', window: 'rect' }, sides: ['top', 'left'], depth: 4 },
        { name: 'client area', sel: '#box > form', real: { capture: 'comdlg-color', window: 'client' }, layoutOnly: true },
        { name: 'OK', sel: '#box button[value=ok]', real: { capture: 'comdlg-color', id: 1 } },
        { name: 'Cancel', sel: '#box button[value=cancel]', real: { capture: 'comdlg-color', id: 2 } },
        { name: 'first label', sel: '#box legend', real: { capture: 'comdlg-color', text: 'Basic colors:' }, layoutOnly: true }
      ],
      metrics: [['space between OK and Cancel', 'gap-x', 'OK', 'Cancel'], ['bottom margin (buttons from the client area)', 'bottom', 'OK', 'client area'], ['button width', 'width', 'OK'], ['button height', 'height', 'OK'], ['OK in from the left of the client area', 'left', 'OK', 'client area']]
    }],
    checks: [async function arrowsInThePalette(page, real) {
      const recording = await real.recording('color-dialog'), ends = recording.steps.flatMap(s => s.events ?? []).filter(e => e.what === 'color');
      // Recorded: run 1 is Right, Right, Down, Space, Enter; run 2 is Right, Enter. The dialog starts on #000080.
      await page.locator('#show').click(); await page.locator('#palette [role=radio][tabindex="0"]').focus();
      const before = await page.evaluate(() => document.querySelector('#palette [aria-checked=true]')?.dataset.color ?? null);
      await page.keyboard.press('ArrowRight');
      const after = await page.evaluate(() => document.querySelector('#palette [aria-checked=true]')?.dataset.color ?? null);
      return [{ what: 'an arrow key alone, in the grid of colours, changes the chosen colour', real: ends[1] ? ends[1].result !== '#000080' : null, example: after !== before, agree: ends[1] ? (ends[1].result !== '#000080') === (after !== before) : false, note: `Real: after Right then Enter the dialog returned ${ends[1]?.result ?? 'nothing'}; after Right, Right, Down, Space, Enter it returned ${ends[0]?.result ?? 'nothing'}. It opened on #000080.` }];
    }]
  },
  {
    id: 'font',
    visual: [{
      setup: async page => { await page.locator('#show').click(); await page.waitForTimeout(100); },
      pairs: [
        { name: 'dialog window', sel: '#box', real: { capture: 'comdlg-font', window: 'rect' }, sides: ['top', 'left'], depth: 4 },
        { name: 'client area', sel: '#box > form', real: { capture: 'comdlg-font', window: 'client' }, layoutOnly: true },
        { name: 'OK', sel: '#box button[value=ok]', real: { capture: 'comdlg-font', id: 1 } },
        { name: 'Cancel', sel: '#box button[value=cancel]', real: { capture: 'comdlg-font', id: 2 } },
        { name: 'first label', sel: '#box label[for=family]', real: { capture: 'comdlg-font', id: 1088 }, layoutOnly: true },
        { name: 'sample group box', sel: '#box fieldset', real: { capture: 'comdlg-font', id: 1073 }, layoutOnly: true }
      ],
      metrics: [['space between the stacked buttons', 'gap-y', 'OK', 'Cancel'], ['right margin (buttons from the client area)', 'right', 'OK', 'client area'], ['left margin (first label from the client area)', 'left', 'first label', 'client area'], ['top margin (first label from the client area)', 'top', 'first label', 'client area'], ['button width', 'width', 'OK'], ['button height', 'height', 'OK']]
    }],
    checks: [async function enterAndEsc(page, real) {
      const recording = await real.recording('font-dialog'), ends = recording.steps.flatMap(s => s.events ?? []).filter(e => e.what === 'modal end').map(e => e.result);
      await page.locator('#show').click(); await page.locator('#size').focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(200); const accepted = /Font: /.test(await resultText(page)) && !await page.evaluate(() => document.querySelector('#box').open);
      await page.locator('#show').click(); await page.keyboard.press('Escape'); await page.waitForTimeout(200); const cancelled = /canceled/.test(await resultText(page));
      return [{ what: 'Enter in a field accepts the dialog', real: ends[0] === 1, example: accepted, agree: (ends[0] === 1) === accepted, note: 'Real: ChooseFont returned ' + ends[0] + ' after a size was typed and Enter pressed.' }, { what: 'Esc cancels the dialog', real: ends.at(-1) === 0, example: cancelled, agree: (ends.at(-1) === 0) === cancelled }];
    }]
  },
  {
    id: 'window',
    visual: [{
      pairs: [
        { name: 'window', sel: '#child', real: { capture: 'menus', cell: 'frame', window: 'rect' }, sides: ['top', 'left'], depth: 4, note: 'A real sizable window; its frame is 4 pixels, a dialog\'s 3.' },
        { name: 'title bar', sel: '#titlebar', real: { capture: 'menus', cell: 'frame', window: 'rect', inset: [4, 4, 4, 278] }, layoutOnly: true },
        { name: 'Close button', sel: '#close', real: { capture: 'menus', cell: 'frame', window: 'rect', inset: [398, 6, 6, 280] }, ring: 2, note: 'The caption buttons are not windows of their own; their place is worked out from the frame (4), the 2 pixels inside the title bar and the 16 by 14 button size the system reports.' },
        { name: 'Maximize button', sel: '#max', real: { capture: 'menus', cell: 'frame', window: 'rect', inset: [380, 6, 24, 280] }, ring: 2 },
        { name: 'Minimize button', sel: '#min', real: { capture: 'menus', cell: 'frame', window: 'rect', inset: [364, 6, 40, 280] }, ring: 2 }
      ],
      metrics: [['title bar height', 'height', 'title bar'], ['frame thickness (title bar in from the left of the window)', 'left', 'title bar', 'window'], ['Close button in from the right of the title bar', 'right', 'Close button', 'title bar'], ['Close button below the top of the title bar', 'top', 'Close button', 'title bar'], ['space between Maximize and Close', 'gap-x', 'Maximize button', 'Close button'], ['space between Minimize and Maximize', 'gap-x', 'Minimize button', 'Maximize button'], ['caption button width', 'width', 'Close button'], ['caption button height', 'height', 'Close button']]
    }],
    checks: [async function systemMenuAndKeyboardMove(page, real) {
      const recording = await real.recording('window-system-menu'), steps = recording.steps, out = [];
      const menuAt = i => steps[i]?.state?.menu;
      // Step 1: Alt+Space. Steps 5 to 10: Alt+Space, M, Right, Right, Down, Enter. Steps 11 to 16: Alt+Space, M, Left, Left, Left, Esc.
      const exits = steps.flatMap(s => s.events ?? []).filter(e => e.what === 'exitsizemove').map(e => String(e.rect).split(',').map(Number));
      const rect = () => page.evaluate(() => { const s = document.querySelector('#child').style; return [parseFloat(s.left), parseFloat(s.top), parseFloat(s.width), parseFloat(s.height)]; });
      await page.locator('#child input').focus(); await page.keyboard.down('Alt'); await page.keyboard.press('Space'); await page.keyboard.up('Alt');
      const open = await page.evaluate(() => !document.querySelector('#window-menu').hidden), first = await page.evaluate(() => document.activeElement?.textContent ?? null);
      out.push({ what: 'Alt+Space opens the window\'s system menu', real: menuAt(1)?.open?.[0]?.name === 'system', example: open, agree: (menuAt(1)?.open?.[0]?.name === 'system') === open });
      out.push({ what: 'command highlighted when the system menu opens from the keyboard', real: menuAt(1)?.open?.[0]?.highlight >= 0 ? menuAt(1).open[0].text.replace(/&/g, '') : null, example: first, agree: (menuAt(1)?.open?.[0]?.highlight >= 0) === (first !== null), note: 'Only whether a command is highlighted is compared; the two menus hold different commands.' });
      await page.keyboard.press('KeyM'); const moved = await page.evaluate(() => document.querySelector('#window-menu').hidden);
      out.push({ what: 'the letter M chooses Move from the open system menu', real: steps[6]?.blind === true || (steps[6]?.events ?? []).some(e => e.what === 'entersizemove'), example: moved, agree: moved === true, note: 'Real: after M the window was in its move loop (the guest stopped answering until Enter).' });
      if (!moved) await page.locator('#move-command').click();
      const start = await rect(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); const end = await rect();
      const realMove = exits[0] ? [exits[0][0] - 8, exits[0][1] - 8] : null;
      out.push({ what: 'Move, then Right, Right, Down, Enter moves the window by (pixels right, pixels down)', real: realMove, example: [end[0] - start[0], end[1] - start[1]], agree: !!realMove && realMove[0] === end[0] - start[0] && realMove[1] === end[1] - start[1] });
      await page.keyboard.down('Alt'); await page.keyboard.press('Space'); await page.keyboard.up('Alt'); await page.locator('#move-command').click();
      const before = await rect(); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('Escape'); const after = await rect();
      out.push({ what: 'Esc during a keyboard move puts the window back', real: exits[1] && exits[0] ? exits[1][0] === exits[0][0] && exits[1][1] === exits[0][1] : null, example: before[0] === after[0] && before[1] === after[1], agree: !!(exits[1] && exits[0]) && (exits[1][0] === exits[0][0]) === (before[0] === after[0]) });
      const title = await page.locator('#titlebar > span').boundingBox(); await page.mouse.dblclick(title.x + 30, title.y + 6);
      const maximised = await page.evaluate(() => document.querySelector('#max').getAttribute('aria-label') === 'Restore');
      const sizes = steps.flatMap(s => (s.events ?? []).map(e => ({ ...e, note: s.step.note }))).filter(e => e.what === 'size');
      const dbl = steps.findIndex(s => s.step.dblclick?.window === 'caption');
      const realMax = dbl >= 0 ? (steps[dbl].events ?? []).some(e => e.what === 'size' && e.type === 2) : null;
      out.push({ what: 'double-clicking the title bar maximizes the window', real: realMax, example: maximised, agree: realMax === maximised });
      return out;
    }]
  },
  { id: 'open-file' },
  { id: 'save-file' },
  { id: 'print' },
  {
    id: 'hotkey',
    visual: [{ pairs: [{ name: 'hot-key box', sel: '#shortcut', real: { capture: 'commctl', cell: 'hotkey' } }], metrics: [['box height', 'height', 'hot-key box']] }],
    behaviour: [{
      script: 'hotkey', steps: { from: 2, to: 9 }, focus: false,
      setup: async page => { await page.locator('#shortcut').focus(); },
      // Before each step the example's field is given the chord the real control held.
      prepare: async (page, before) => { const c = before.controls.hotkey, name = c.vk >= 112 && c.vk <= 123 ? `F${c.vk - 111}` : c.vk ? String.fromCharCode(c.vk) : ''; await page.evaluate(v => { document.querySelector('#shortcut').value = v; document.querySelector('#shortcut').focus(); }, name ? [c.mods & 2 ? 'Ctrl' : '', c.mods & 4 ? 'Alt' : '', c.mods & 1 ? 'Shift' : '', name].filter(Boolean).join('+') : ''); },
      real: state => { const c = state.controls.hotkey; return { key: c.vk >= 112 && c.vk <= 123 ? `F${c.vk - 111}` : c.vk ? String.fromCharCode(c.vk) : null, ctrl: !!(c.mods & 2) && !!c.vk, alt: !!(c.mods & 4) && !!c.vk, shift: !!(c.mods & 1) && !!c.vk }; },
      example: page => page.evaluate(() => { const el = document.querySelector('#shortcut'), parts = el.value ? el.value.split('+') : []; return { key: parts.at(-1) ?? null, ctrl: parts.includes('Ctrl'), alt: parts.includes('Alt'), shift: parts.includes('Shift') }; })
    }]
  },
  { id: 'rich-text' },
  { id: 'animation' }
];
