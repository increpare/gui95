import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { pageHelpers, buildReport, withPage, summarizeReport, lintCommand } from './lint-shared.mjs';

/**
 * Dialog units and the thresholds built on them, in one place so they can be corrected.
 * ASSUMED conversion: with 8-point MS Sans Serif at 96 dpi the dialog base unit is 6 x 13 px, so one
 * horizontal unit is 1.5 px and one vertical unit 1.625 px. This has not been measured on Windows 95.
 */
export const UNITS = Object.freeze({
  horizontalPx: 1.5,          // one horizontal dialog unit (assumed)
  verticalPx: 1.625,          // one vertical dialog unit (assumed)
  minGap: 4,                  // dialog units between controls (final guidelines, Grouping and Spacing, figure 13.23)
  margin: 7,                  // dialog units from the window edge to its controls (same figure)
  wizardMargin: 6,            // the same for a wizard (measured on Windows 95: 10px round its buttons)
  sheetMargin: 4,             // the same for a property sheet, between its frame and the tab control (measured on Windows 95: 6px and 7px)
  maxWindow: 263,             // dialog units, each way, for a secondary window (final guidelines, Font and Size)
  tolerancePx: 0.5,           // slack for sub-pixel layout before a threshold counts as missed
  nearMissPx: 2.5,            // edges or baselines this close but not equal count as a missed alignment
  unevenGapPx: 4,             // gaps in one row or column that differ by up to this much count as inconsistent
  nearWidthPx: 4              // button widths this close but not equal count as meant to match
});
const px = (units, each) => +(units * each).toFixed(2);
const FINAL = 'Windows Interface Guidelines, final 1995';
const sizes = `${px(UNITS.minGap, UNITS.horizontalPx)}px across and ${px(UNITS.minGap, UNITS.verticalPx)}px down`;

/** Each rule names a layout tell and what the final guidelines ask for. Pixel figures rest on the assumed conversion in UNITS. */
export const RULES = Object.freeze({
  'control-gap': `Leave at least ${UNITS.minGap} dialog units between controls (${sizes} under the assumed conversion). ${FINAL}, Grouping and Spacing: stated.`,
  'uneven-gap': `Controls in one row or column are spaced evenly; a gap that differs from its neighbours by a few pixels reads as a mistake. ${FINAL}, Grouping and Spacing and Alignment: inferred from the consistent-spacing guidance and figure 13.23.`,
  'edge-near-miss': `Controls stacked in a column share a left edge. An edge one or two pixels off its neighbour is a missed alignment; move it onto the same line. ${FINAL}, Alignment: stated (align controls); the near-miss test is this lint's.`,
  'baseline-near-miss': `A label beside its text box or drop-down list sits on the same text baseline as the field's text. ${FINAL}, Alignment: stated; the near-miss test is this lint's and the baselines are estimated from font metrics.`,
  'button-height-mismatch': `Command buttons in one row or column are the same height (14 dialog units). ${FINAL}, figure 13.23: stated; every button in Microsoft's File Manager templates is 14 units high.`,
  'button-width-mismatch': `Command buttons in one row or column share a width (OK, Cancel, Apply, Help, Yes, No and their neighbours); only a much longer label earns a wider button. ${FINAL}, Font and Size: stated as a recommendation.`,
  'no-default-button': `A dialog box with command buttons has a default button, the one Enter presses, drawn with the heavy border: <button class="default"> or data-gui95-default. ${FINAL}, Default Buttons: stated as the common convention; a window where a multiline text box needs Enter may have none, so a dialog with one is not reported.`,
  'destructive-default': `The default button must not carry out an irreversible or destructive action; make Cancel or the safe choice the default. ${FINAL}, Default Buttons: stated.`,
  'duplicate-access-key': `Access keys are unique within one dialog box or menu. ${FINAL}, Access Keys: stated.`,
  'ok-cancel-access-key': `OK and Cancel take no access key: Enter and Esc already reach them. ${FINAL}, Access Keys: stated.`,
  'apply-access-key': `Reserve "A" for the Apply button. ${FINAL}, Access Keys: stated.`,
  'dialog-margin': `Leave ${UNITS.margin} dialog units (${px(UNITS.margin, UNITS.horizontalPx)}px across, ${px(UNITS.margin, UNITS.verticalPx)}px down under the assumed conversion) between the edge of a dialog box and its controls; a property sheet leaves ${UNITS.sheetMargin} units round its tab control (measured on Windows 95). ${FINAL}, figure 13.23: stated.`,
  'window-too-large': `Avoid a secondary window larger than ${UNITS.maxWindow} by ${UNITS.maxWindow} dialog units (${px(UNITS.maxWindow, UNITS.horizontalPx)} by ${px(UNITS.maxWindow, UNITS.verticalPx)}px under the assumed conversion). ${FINAL}, Font and Size: stated.`
});
/** Every rule warns by default. Pass strict to make any finding fail. */
export const SEVERITY = Object.freeze(Object.fromEntries(Object.keys(RULES).map(rule => [rule, 'warn'])));
/** A default button whose label starts with one of these is reported by destructive-default. "Replace All" is the guidelines' own example. */
export const DESTRUCTIVE_VERBS = Object.freeze(['delete', 'remove', 'erase', 'format', 'discard', 'overwrite', 'destroy', 'purge', 'wipe', 'empty', 'reset', 'clear', 'uninstall', 'revert', 'terminate', 'kill', 'drop', 'replace all']);
/** Buttons with these labels are expected to share one width wherever they share a row or column. */
export const STANDARD_BUTTONS = Object.freeze(['ok', 'cancel', 'yes', 'no', 'close', 'apply', 'help', 'retry', 'ignore', 'abort', 'back', 'next', 'finish', 'save', 'open', 'browse']);

const limits = Object.freeze([
  'Pixel thresholds rest on an assumed dialog-unit conversion (1.5px across, 1.625px down); it has not been measured on Windows 95. Correct UNITS in layout-lint.mjs when it has.',
  'Only visible dialogs and windows are measured; open each dialog and tab page you want checked before linting.',
  'Controls that touch (a text box and its up-down arrows, toolbar buttons) are treated as one composite control. Menus, toolbars, tab strips, title bars and the contents of lists, trees and tables are not measured.',
  'Near-miss rules report only small differences; clearly different positions and sizes are taken as intended.',
  'Baselines are estimated from font metrics and the field\'s padding, not read from the rendered glyphs.',
  'The default button is recognised by class="default" or data-gui95-default. destructive-default reads the label only; it cannot tell that "Yes" confirms a deletion.',
  'Every finding is a warning. A clean report does not establish that the layout is right; review the screenshots.'
]);

/** Runs inside the page. Self-contained apart from its arguments. */
function layoutInPage(h, config) {
  const U = config.units, tol = U.tolerancePx, eps = 0.01;
  const gapX = U.minGap * U.horizontalPx, gapY = U.minGap * U.verticalPx;
  const round = value => +value.toFixed(1);
  const containerSelector = `${h.dialogs},.window`;
  const containers = h.all(containerSelector);
  const ownerOf = element => element.closest(containerSelector) || element.closest('.gui95,[data-gui95]') || document.body;
  const unmeasured = '[role=menubar],[data-gui95-menubar],[role=menu],[role=tablist],[role=toolbar],.toolbar,[data-gui95-toolbar],.title-bar,[role=listbox],[role=tree],[data-gui95-tree],table,[role=grid],[role=treegrid],[contenteditable]:not([contenteditable=false])';
  const textFields = 'input:not([type=checkbox],[type=radio],[type=button],[type=submit],[type=reset],[type=image],[type=hidden],[type=range],[type=color],[type=file])';
  const kindOf = element => {
    if (element.parentElement && element.parentElement.closest(unmeasured)) return null;
    if (h.isCommandButton(element)) return 'button';
    if (element.matches('input[type=checkbox],input[type=radio]')) return 'check';
    if (element.matches(`${textFields},input[type=range],input[type=file],select,textarea,[role=listbox],[role=combobox],[role=slider],progress,meter`)) return 'field';
    return null;
  };
  const labelText = element => h.labelParts(element).text.replace(/\s*(\.{2,}|…)$/, '').trim();
  const controls = [];
  for (const element of h.elements) {
    const kind = kindOf(element);
    if (!kind || !h.visible(element)) continue;
    // A check box or option button is measured with its label, as the single control Windows draws.
    const wrap = kind === 'check' ? element.closest('label') : null;
    const box = wrap && h.visible(wrap) ? wrap : element, rect = box.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    controls.push({ element, box, kind, rect, owner: ownerOf(element) });
  }
  const byOwner = new Map();
  for (const control of controls) { if (!byOwner.has(control.owner)) byOwner.set(control.owner, []); byOwner.get(control.owner).push(control); }
  const overlapX = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const overlapY = (a, b) => Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);

  for (const group of byOwner.values()) {
    const list = group.slice(0, 400);
    for (const a of list) {
      // control-gap: the nearest control below and the nearest to the right.
      for (const axis of ['down', 'right']) {
        let nearest = null, distance = Infinity;
        for (const b of list) {
          if (b === a) continue;
          const shared = axis === 'down' ? overlapX(a.rect, b.rect) : overlapY(a.rect, b.rect);
          const gap = axis === 'down' ? b.rect.top - a.rect.bottom : b.rect.left - a.rect.right;
          if (shared > 1 && gap > -eps && gap < distance) { nearest = b; distance = gap; }
        }
        const least = axis === 'down' ? gapY : gapX;
        if (nearest && distance > eps && distance < least - tol) h.report(nearest.box, 'control-gap', `${round(distance)}px ${axis === 'down' ? 'below' : 'right of'} ${h.identity(a.box)}; minimum ${round(least)}px (${U.minGap} dialog units)`);
      }
      // edge-near-miss: the next control below in the same column.
      let below = null;
      for (const b of list) {
        if (b === a || overlapX(a.rect, b.rect) <= 1 || b.rect.top < a.rect.bottom - eps) continue;
        if (!below || b.rect.top < below.rect.top - eps || (Math.abs(b.rect.top - below.rect.top) <= eps && Math.abs(b.rect.left - a.rect.left) < Math.abs(below.rect.left - a.rect.left))) below = b;
      }
      const off = below ? Math.abs(below.rect.left - a.rect.left) : 0;
      if (off > tol && off <= U.nearMissPx) h.report(below.box, 'edge-near-miss', `left edge at ${round(below.rect.left)}px, ${round(off)}px off ${h.identity(a.box)} at ${round(a.rect.left)}px`);
    }
  }

  // uneven-gap: consecutive like children of one parent, in a row or a column.
  const boxes = new Map(controls.map(control => [control.box, control]));
  const holders = new Set(controls.map(control => control.box.parentElement).filter(Boolean));
  for (const control of controls) for (let node = control.box.parentElement; node && node !== control.owner; node = node.parentElement) if (node.parentElement) holders.add(node.parentElement);
  for (const parent of holders) {
    const runs = []; let run = null;
    for (const child of parent.children) {
      if (!h.visible(child) || ['absolute', 'fixed'].includes(getComputedStyle(child).position)) continue;
      const key = boxes.has(child) ? boxes.get(child).kind : controls.some(control => child.contains(control.box)) ? `${child.tagName}.${child.className}` : null;
      if (key && run && run.key === key) run.items.push(child); else { run = key ? { key, items: [child] } : null; if (run) runs.push(run); }
    }
    for (const { items } of runs) {
      if (items.length < 3) continue;
      const rects = items.map(item => item.getBoundingClientRect());
      for (const axis of ['row', 'column']) {
        const gaps = [];
        for (let i = 1; i < rects.length; i++) { const a = rects[i - 1], b = rects[i]; const gap = axis === 'row' ? b.left - a.right : b.top - a.bottom; if (gap < -eps || (axis === 'row' ? overlapY(a, b) : overlapX(a, b)) <= 1) { gaps.length = 0; break; } gaps.push(gap); }
        if (gaps.length < 2) continue;
        const spread = Math.max(...gaps) - Math.min(...gaps);
        if (spread > tol && spread <= U.unevenGapPx) h.report(parent, 'uneven-gap', `${axis} gaps ${gaps.map(round).join(', ')}px between ${items.length} ${boxes.has(items[0]) ? boxes.get(items[0]).kind + ' controls' : 'groups'}`);
      }
    }
  }

  // Button rows and columns: command buttons that share a parent.
  const buttonsByParent = new Map();
  for (const control of controls) if (control.kind === 'button') { const parent = control.box.parentElement; if (!buttonsByParent.has(parent)) buttonsByParent.set(parent, []); buttonsByParent.get(parent).push(control); }
  const compare = (parent, set, shape) => {
    const names = set.map(item => labelText(item.element) || h.identity(item.element));
    const heights = set.map(item => item.rect.height), widths = set.map(item => item.rect.width);
    if (Math.max(...heights) - Math.min(...heights) > tol) h.report(parent, 'button-height-mismatch', `${shape} heights ${heights.map(round).join(', ')}px: ${names.join(', ')}`);
    const standard = set.filter(item => config.standardButtons.includes(labelText(item.element).toLowerCase())).map(item => item.rect.width);
    const sorted = [...widths].sort((a, b) => a - b);
    const near = sorted.some((width, index) => index > 0 && width - sorted[index - 1] > tol && width - sorted[index - 1] <= U.nearWidthPx);
    if ((standard.length > 1 && Math.max(...standard) - Math.min(...standard) > tol) || near) h.report(parent, 'button-width-mismatch', `${shape} widths ${widths.map(round).join(', ')}px: ${names.join(', ')}`);
  };
  for (const [parent, set] of buttonsByParent) {
    const rows = [];
    for (const item of [...set].sort((a, b) => a.rect.top - b.rect.top)) { const row = rows.find(candidate => overlapY(candidate[0].rect, item.rect) > Math.min(candidate[0].rect.height, item.rect.height) / 2); if (row) row.push(item); else rows.push([item]); }
    for (const row of rows) if (row.length > 1) compare(parent, row.sort((a, b) => a.rect.left - b.rect.left), 'row');
    const singles = rows.filter(row => row.length === 1).map(row => row[0]);
    const column = singles.filter(item => Math.abs(item.rect.left - singles[0].rect.left) <= U.nearMissPx);
    if (column.length > 1) compare(parent, column, 'column');
  }

  // Default buttons.
  const isDefault = element => element.matches('.default,[data-gui95-default]');
  for (const control of controls) if (control.kind === 'button' && isDefault(control.element)) { const name = labelText(control.element).toLowerCase(); if (config.destructive.some(verb => name === verb || name.startsWith(verb + ' '))) h.report(control.element, 'destructive-default', JSON.stringify(labelText(control.element))); }
  const dialogs = containers.filter(element => element.matches(h.dialogs));
  for (const dialog of dialogs) { const buttons = (byOwner.get(dialog) || []).filter(control => control.kind === 'button'); if (buttons.length && !buttons.some(control => isDefault(control.element)) && ![...dialog.querySelectorAll('textarea,[contenteditable]:not([contenteditable=false])')].some(h.visible)) h.report(dialog, 'no-default-button', `${buttons.length} command button${buttons.length === 1 ? '' : 's'}: ${buttons.slice(0, 6).map(control => labelText(control.element) || h.identity(control.element)).join(', ')}`); }

  // Access keys, per dialog or window and per menu.
  const keyed = (elements, where) => {
    const seen = new Map();
    for (const element of elements) { const key = h.accessKey(element); if (!key) continue; if (seen.has(key)) h.report(element, 'duplicate-access-key', `"${key.toUpperCase()}" is also the access key of ${h.identity(seen.get(key))} in ${where}`); else seen.set(key, element); }
    return seen;
  };
  const labelled = 'button,[role=button],label,legend,[role=tab],input[type=button],input[type=submit],input[type=reset]';
  for (const owner of new Set([...containers, ...byOwner.keys()])) {
    const members = h.all(labelled).filter(element => ownerOf(element) === owner && !element.closest('[role=menu],[role=menubar],[data-gui95-menubar],.title-bar'));
    const seen = keyed(members, 'this ' + (owner.matches(h.dialogs) ? 'dialog box' : 'window'));
    for (const element of members.filter(h.isCommandButton)) {
      const name = labelText(element).toLowerCase(), key = h.accessKey(element);
      if ((name === 'ok' || name === 'cancel') && key) h.report(element, 'ok-cancel-access-key', `${labelText(element)} has the access key "${key.toUpperCase()}"`);
      if (name === 'apply' && key && key !== 'a') h.report(element, 'apply-access-key', `Apply has the access key "${key.toUpperCase()}"`);
      if (name === 'apply' && !key && seen.has('a')) h.report(seen.get('a'), 'apply-access-key', `"A" is taken while ${h.identity(element)} is the Apply button`);
    }
  }
  for (const menu of h.all('[role=menu],[role=menubar],[data-gui95-menubar]')) keyed(h.all('button,[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio]').filter(element => element.closest('[role=menu],[role=menubar],[data-gui95-menubar]') === menu), 'this menu');

  // Dialog margin and size, measured on the client area: inside the frame and below the title bar.
  const content = 'fieldset,[role=tablist],[role=tabpanel],img,svg,hr,[role=listbox],[role=tree],[data-gui95-tree],table,[role=grid]';
  for (const dialog of dialogs) {
    const outer = dialog.getBoundingClientRect(), bar = [...dialog.querySelectorAll('.title-bar')].find(h.visible), style = getComputedStyle(dialog);
    const client = { left: outer.left + parseFloat(style.borderLeftWidth), right: outer.right - parseFloat(style.borderRightWidth), top: outer.top + parseFloat(style.borderTopWidth), bottom: outer.bottom - parseFloat(style.borderBottomWidth) };
    if (bar && bar.closest(containerSelector) === dialog) { const rect = bar.getBoundingClientRect(), frame = Math.max(0, rect.top - outer.top); client.left = rect.left; client.right = rect.right; client.top = rect.bottom; client.bottom = outer.bottom - frame; }
    const width = client.right - client.left, height = client.bottom - client.top;
    const maxWidth = U.maxWindow * U.horizontalPx, maxHeight = U.maxWindow * U.verticalPx;
    if (width > maxWidth + tol || height > maxHeight + tol) h.report(dialog, 'window-too-large', `client area ${round(width)} by ${round(height)}px is ${Math.round(width / U.horizontalPx)} by ${Math.round(height / U.verticalPx)} dialog units; limit ${U.maxWindow} by ${U.maxWindow} (${round(maxWidth)} by ${round(maxHeight)}px)`);
    const rects = (byOwner.get(dialog) || []).map(control => control.rect);
    for (const element of dialog.querySelectorAll('*')) {
      if (element.closest('.title-bar') || element.closest(containerSelector) !== dialog || !h.visible(element)) continue;
      if (element.matches(content)) { rects.push(element.getBoundingClientRect()); continue; }
      for (const node of element.childNodes) if (node.nodeType === 3 && node.textContent.trim()) { const range = document.createRange(); range.selectNodeContents(node); const rect = range.getBoundingClientRect(); if (rect.width && rect.height) rects.push(rect); }
    }
    if (!rects.length) continue;
    // A property sheet (a dialog whose own content is a tab control) frames its pages with 4 units; the 7-unit margin is inside each page. A wizard's button row sits 10px from the edges.
    const units = [...dialog.querySelectorAll('[role="tablist"]')].some(list => list.closest(containerSelector) === dialog && h.visible(list)) ? U.sheetMargin : dialog.querySelector('[data-gui95-buttons="wizard"]') ? U.wizardMargin : U.margin;
    const least = { left: units * U.horizontalPx, right: units * U.horizontalPx, top: units * U.verticalPx, bottom: units * U.verticalPx };
    const margins = { left: Math.min(...rects.map(rect => rect.left)) - client.left, top: Math.min(...rects.map(rect => rect.top)) - client.top, right: client.right - Math.max(...rects.map(rect => rect.right)), bottom: client.bottom - Math.max(...rects.map(rect => rect.bottom)) };
    const short = Object.keys(margins).filter(side => margins[side] < least[side] - tol);
    if (short.length) h.report(dialog, 'dialog-margin', `${short.map(side => `${side} ${round(margins[side])}px`).join(', ')}; minimum ${round(least.left)}px at the sides and ${round(least.top)}px at top and bottom (${units} dialog units)`);
  }

  // baseline-near-miss: a label beside the single-line field it names.
  const canvas = document.createElement('canvas').getContext('2d');
  const metrics = style => { canvas.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`; const measured = canvas.measureText('Hg'); return { ascent: measured.fontBoundingBoxAscent, descent: measured.fontBoundingBoxDescent }; };
  const pairs = [];
  for (const label of h.all('label')) if (label.control) pairs.push([label, label.control]);
  for (const control of h.elements.filter(element => element.matches('[aria-labelledby]'))) for (const id of control.getAttribute('aria-labelledby').split(/\s+/)) { const label = id && document.getElementById(id); if (label && label.tagName !== 'LABEL' && h.visible(label)) pairs.push([label, control]); }
  for (const [label, control] of pairs) {
    if (!h.visible(control) || !(control.matches(textFields) || (control.matches('select') && !control.multiple && control.size <= 1)) || label.closest(unmeasured)) continue;
    const walker = document.createTreeWalker(label, NodeFilter.SHOW_TEXT); let node = walker.nextNode();
    while (node && (!node.textContent.trim() || control.contains(node))) node = walker.nextNode();
    if (!node || (label.contains(control) && !(node.compareDocumentPosition(control) & Node.DOCUMENT_POSITION_FOLLOWING))) continue;
    const range = document.createRange(); range.selectNodeContents(node);
    const text = range.getClientRects()[0], field = control.getBoundingClientRect();
    if (!text || overlapY(text, field) <= 1 || text.right > field.left + 1) continue;
    const labelFont = metrics(getComputedStyle(node.parentElement)), fieldStyle = getComputedStyle(control), fieldFont = metrics(fieldStyle);
    const labelBase = text.top + (text.height - labelFont.ascent - labelFont.descent) / 2 + labelFont.ascent;
    const top = field.top + parseFloat(fieldStyle.borderTopWidth) + parseFloat(fieldStyle.paddingTop);
    const inner = field.height - parseFloat(fieldStyle.borderTopWidth) - parseFloat(fieldStyle.borderBottomWidth) - parseFloat(fieldStyle.paddingTop) - parseFloat(fieldStyle.paddingBottom);
    const fieldBase = top + (inner - fieldFont.ascent - fieldFont.descent) / 2 + fieldFont.ascent;
    const off = Math.abs(labelBase - fieldBase);
    if (off >= 1 - eps && off <= U.nearMissPx + tol) h.report(label, 'baseline-near-miss', `label baseline ${round(off)}px ${labelBase < fieldBase ? 'above' : 'below'} the text of ${h.identity(control)}`);
  }
  return { scope: h.scope, scoped: h.scoped, checked: controls.length, containers: containers.length, violations: h.violations, ignored: h.ignored };
}

/** Inspect an already loaded Playwright page. Read-only: nothing is clicked, focused or changed. */
export async function lintPage(page, { strict = false, skip = [] } = {}) {
  const found = await page.evaluate(`(${layoutInPage})((${pageHelpers})(), ${JSON.stringify({ units: UNITS, destructive: DESTRUCTIVE_VERBS, standardButtons: STANDARD_BUTTONS })})`);
  return { ...buildReport('layout', found, { severity: SEVERITY, limits, strict, skip }), containers: found.containers, units: UNITS, checkedUnit: `controls in ${found.containers} visible dialog(s) and window(s)` };
}

/** Open an explicitly selected running URL in headless Chromium and lint its layout. Never starts a server. */
export const runLayoutLint = ({ url, strict = false, skip = [] } = {}) => withPage(url, page => lintPage(page, { strict, skip }));

/** Group a report by rule for reading in a terminal. */
export const summarize = report => summarizeReport('Layout lint', RULES, report);

export const main = (args, io = {}) => lintCommand(args, { usage: 'node kit/verify/layout-lint.mjs', run: runLayoutLint, summarize, ...io });

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = await main(process.argv.slice(2));
