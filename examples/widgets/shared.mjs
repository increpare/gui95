// Original GUI95 examples, MIT. Authoring helpers are inlined into each output.
export const draft = 'https://ics.uci.edu/~kobsa/courses/ICS104/course-notes/Microsoft_WindowsGuidelines.pdf';
export const apg = name => `https://www.w3.org/WAI/ARIA/apg/patterns/${name}/`;
export const example = (id, title, family, body, setup, states, keys, note, pattern, chapter = '7–8') => ({
  id, title, family, body, setup, states, keys, note,
  sources: [{label: `Microsoft preliminary guide (1995), chapters ${chapter}`, url: draft},
    ...(pattern ? [{label: 'Modern browser accessibility pattern', url: apg(pattern)}] : [])]
});

export function helpers() {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const report = message => { $('#result').textContent = message; };
  const on = (target, event, fn) => target.addEventListener(event, fn);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const tabs = root => {
    const buttons = $$('[role=tab]', root);
    const select = button => buttons.forEach(item => {
      const active = item === button;
      item.tabIndex = active ? 0 : -1;
      item.setAttribute('aria-selected', String(active));
      document.getElementById(item.getAttribute('aria-controls')).hidden = !active;
    });
    buttons.forEach((button, i) => {
      on(button, 'click', () => select(button));
      on(button, 'keydown', event => {
        let next;
        // A Windows 95 tab control stops at its first and last tab; the arrows do not wrap.
        if (event.key === 'ArrowRight') next = Math.min(i + 1, buttons.length - 1);
        if (event.key === 'ArrowLeft') next = Math.max(i - 1, 0);
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = buttons.length - 1;
        if (next === undefined) return;
        event.preventDefault(); select(buttons[next]); buttons[next].focus();
      });
    });
  };
  const dialog = (trigger, box) => {
    on(trigger, 'click', () => box.showModal());
    on(box, 'close', () => { trigger.focus(); report(`Dialog result: ${box.returnValue || 'cancel'}`); });
    on(box, 'cancel', () => { box.returnValue = 'cancel'; });
  };
  // Up-down buttons (kit "Up-down control" markup) step their field without the kit runtime.
  const spin = (root = document) => $$('[data-gui95-step]', root).forEach(button => {
    const input = document.getElementById(button.dataset.gui95Step);
    if (!input) return;
    button.tabIndex = -1;
    on(button, 'mousedown', event => {
      if (event.button !== 0) return;
      event.preventDefault();
      if (document.activeElement !== input) input.focus();
    });
    on(button, 'click', () => {
      if (input.disabled || input.readOnly) return;
      const before = input.value;
      try { Number(button.dataset.gui95Delta) < 0 ? input.stepDown() : input.stepUp(); } catch { return; }
      const low = input.min === '' ? -Infinity : Number(input.min), high = input.max === '' ? Infinity : Number(input.max);
      if (!Number.isNaN(input.valueAsNumber)) input.valueAsNumber = clamp(input.valueAsNumber, low, high);
      if (input.value === before) return;
      input.dispatchEvent(new Event('input', {bubbles: true}));
      input.dispatchEvent(new Event('change', {bubbles: true}));
    });
  });
  // A compact local scope; no globals or application engine are required.
  return {$, $$, report, on, clamp, tabs, dialog, spin};
}

// Example page layer only. Each page inlines kit/components/gui95.css first; these rules lay out the examples.
export const css = `
html{background:#008080}
body.gui95{margin:0;padding:20px;background:transparent}
button,a,input,select,textarea,[tabindex]{touch-action:manipulation}
a{color:#000080}
label{display:inline-flex;align-items:center;gap:4px}
.gui95 .window{max-width:920px;margin:auto}
.gui95 .gallery{max-width:1120px}
.title-bar h1{font:inherit;margin:0}
.content{padding:12px}
.crumb{margin:0 0 12px}
.stage{position:relative;min-height:190px;padding:16px;border:1px solid #808080;box-shadow:1px 1px #fff,inset 1px 1px #fff}
.row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.stack{display:grid;gap:8px}
.stack>button{justify-self:start}
.actions{display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap;margin-top:12px}
.actions button{min-width:75px}
.field{display:grid;gap:3px;align-content:start;justify-items:start}
.field :is(input,select,textarea){max-width:100%}
.field textarea{width:100%}
.hint{line-height:1.5}
.result{margin:12px 0;padding:3px 5px;min-height:20px;overflow-wrap:anywhere;box-shadow:inset 1px 1px #808080,inset -1px -1px #fff}
.guide{line-height:1.5}
.guide h2{font-size:1em;margin:12px 0 2px}
.guide p{margin:2px 0 8px}
.error{color:#800000;min-height:1.5em}
.gui95 :is(.sunken,.pane,.scrollbox){background:#fff;border:1px solid;border-color:#808080 #fff #fff #808080;box-shadow:inset 1px 1px #000,inset -1px -1px #dfdfdf}
.pane{padding:8px;overflow:auto;min-width:0}
.scrollbox{overflow:auto;resize:both;width:100%;height:145px;padding:8px}
.gui95 input[type="file"]{padding:0;background:transparent;box-shadow:none}
.gui95 input[type="file"]::file-selector-button{font:inherit;color:#000;margin:0 6px 0 0;min-height:23px;padding:4px 10px;border:0;border-radius:0;background:#c0c0c0;box-shadow:var(--gui95-raised)}
.gui95 .swatch{width:24px;height:24px;min-width:24px;min-height:0;padding:0;box-shadow:var(--gui95-sunken)}
.gui95 .swatch[aria-checked="true"]{box-shadow:var(--gui95-sunken),0 0 0 2px #000}
table{border-collapse:collapse;width:100%;background:#fff}
th,td{text-align:left;padding:1px 4px;border:0}
th{padding:3px 6px;font-weight:normal;background:#c0c0c0;box-shadow:var(--gui95-raised)}
th:has(>button){padding:0;box-shadow:none}
th button{display:block;width:100%;min-width:60px;text-align:left}
[data-gui95-density="period"] th{padding:2px 6px}
[data-gui95-density="period"] th:has(>button){padding:0}
.gui95[data-gui95-density="period"] th button,.gui95 [data-gui95-density="period"] th button{min-height:17px;--gui95-pad-y:2px;--gui95-pad-x:6px;line-height:13px}
[data-gui95-density="period"] :is(th,td){line-height:13px}
[data-gui95-density="period"] td{padding:0 4px 1px}
.gui95 tr[aria-selected="true"]{background:#000080;color:#fff}
.menu{position:absolute;z-index:5;margin:0;min-width:180px}
.menu:focus{outline:none}
.gui95 .menu [role^="menuitem"]{gap:6px;padding-left:4px;padding-right:8px}
.gui95 .menu [role^="menuitem"]:not(:has(.mark)){padding-left:24px}
.gui95 .menu [role^="menuitem"]::before{content:none}
.menu .mark{flex:none;width:14px;text-align:center}
.menu .key{margin-left:auto;padding-left:16px}
.gui95 [role="menubar"]{display:flex;flex-wrap:wrap;padding:var(--gui95-menubar-pad)}
.gui95 [role="menubar"]>[role="menuitem"]{flex:none;width:auto;min-height:var(--gui95-menubar-item-h);padding:2px 7px calc(2px + var(--gui95-menubar-item-drop))}
.gui95 [role="menubar"]>[role="menuitem"]:is(:focus,[aria-expanded="true"]){background:#000080;color:#fff;outline:none}
.gui95 [role="tree"] [role="treeitem"]:focus-visible{outline:none}
.gui95 dialog{width:min(460px,calc(100vw - 24px))}
.stage dialog:not(:modal){max-width:100%}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:8px}
.card{padding:8px;line-height:1.4;border:1px solid #808080;box-shadow:1px 1px #fff,inset 1px 1px #fff}
.card h3{margin:0 0 4px;font-size:1em}
.card p{margin:4px 0}
.gallery h2{font-size:1em;margin:14px 0 6px}
.catalog-nav{display:flex;gap:12px;flex-wrap:wrap;margin:12px 0}
.count{float:right}
.preview{display:block;width:100%;height:470px;border:0;padding:2px;background:#c0c0c0;box-shadow:var(--gui95-sunken)}
.print-only{display:none}
@media(max-width:550px){body.gui95{padding:6px}.content{padding:8px}.stage{padding:10px}.cards{grid-template-columns:1fr}}
@media(prefers-reduced-motion:reduce){*{animation:none!important;scroll-behavior:auto!important}}
@media(forced-colors:active){.gui95 :is(input[type=checkbox],input[type=radio],input[type=range],progress,select){appearance:auto;background-image:none}.gui95 :is(button,input,select,textarea,.window,dialog,.menu,[role=listbox],[role=tabpanel],.sunken,.pane,.scrollbox){border:1px solid ButtonText;box-shadow:none}.gui95 :is(tr[aria-selected=true],[role=option][aria-selected=true],[role=treeitem][aria-selected=true]>[data-gui95-tree-label]){background:Highlight;color:HighlightText}.gui95 button[aria-pressed=true]{border:3px double ButtonText}.gui95 .title-bar{forced-color-adjust:none;background:Highlight;color:HighlightText}.gui95 .title-bar button{forced-color-adjust:auto}}
@media print{html{background:#fff}body.gui95{padding:0}.gui95 .window{box-shadow:none}.gui95 :is(.title-bar,.crumb,.guide,.result,.no-print){display:none}.stage{border:0;box-shadow:none}.print-only{display:block}}
`;
