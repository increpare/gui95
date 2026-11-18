import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Each rule names a modern styling tell and the classic treatment that replaces it. */
export const RULES = Object.freeze({
  'rounded-corner': 'Corners are square. Use border-radius: 0; draw round option buttons and stepped tab corners from pixel artwork or clip-path.',
  'soft-shadow': 'Depth is two hard edge lines, never a blur. Use 1px inset box-shadow steps with no blur radius, and a 1px 1px white text-shadow for disabled labels.',
  'translucency': 'Surfaces and text are opaque. Use the solid palette colour, and the gray label with a white offset for unavailable controls instead of opacity.',
  'animation': 'State changes are immediate. Remove transitions and CSS animations from controls.',
  'pointer-cursor': 'Controls keep the arrow cursor. Use cursor: default; reserve other cursors for resize handles and text. Hyperlinks are exempt.',
  'keyword-bevel': 'outset, inset, groove and ridge borders let the browser choose the shades. Draw the four-colour bevel with the --gui95-raised or --gui95-sunken box-shadow, or 1px solid edge lines.',
  'modern-font': 'Interface text uses the chosen classic face (Tahoma, MS Sans Serif or the System95 recreation) rather than the host system UI font.',
  'filter-effect': 'Blur and backdrop filters have no classic counterpart. Remove them.',
  'native-control': 'A native control with appearance: auto is drawn by the current operating system. Use the stylesheet\'s appearance: none treatment for check boxes, option buttons, sliders, progress bars and drop-down lists.',
  'dimmed-backdrop': 'A modal dialog does not dim the window behind it. Use dialog::backdrop { background: transparent }.',
  'control-text-size': 'Control text is 11px, the size of 8-point MS Sans Serif at 96 dpi. Set buttons, labels, fields, drop-down lists, menu items and tabs to the stylesheet\'s 11px; keep larger type for reading surfaces and mark those with data-gui95-lint-ignore.'
});
const limits = Object.freeze([
  'Only visible elements are inspected; open each menu, dialog and tab page you want checked before linting.',
  'Elements at opacity 0 (their own or an ancestor\'s) count as hidden, and the shapes inside an SVG image are image content: neither is inspected. The svg element itself is.',
  'control-text-size reads the declared pixel size of control text. It cannot tell which typeface the host actually drew.',
  'Scrollbar parts, hover and pressed states, native popup lists and image content are not inspected.',
  'Passing means none of the listed modern tells were found. It does not establish layout, glyph or Windows 95 fidelity; review the screenshots.'
]);

/** Inspect an already loaded Playwright page. Read-only: nothing is clicked, focused or changed. */
export async function lintPage(page) {
  const found = await page.evaluate(() => {
    const scoped = [...document.querySelectorAll('.gui95,[data-gui95]')];
    const roots = scoped.length ? scoped : [document.body];
    const elements = [...new Set(roots.flatMap(root => [root, ...root.querySelectorAll('*')]))].filter(element => !['SCRIPT', 'STYLE', 'LINK', 'META', 'TITLE', 'HEAD'].includes(element.tagName));
    const visible = element => !!element.getClientRects().length && element.checkVisibility({ visibilityProperty: true, opacityProperty: true });
    const textControls = 'button,select,textarea,label,legend,summary,[role=button],[role=tab],[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio],input:not([type=checkbox],[type=radio],[type=range],[type=color],[type=file],[type=image],[type=hidden])';
    const ownText = element => element.matches('input,select,textarea') || [...element.childNodes].some(node => node.nodeType === 3 && node.textContent.trim());
    const ignoreOwner = (element, rule) => { const owner = element.closest('[data-gui95-lint-ignore]'); return owner && owner.getAttribute('data-gui95-lint-ignore').split(/\s+/).includes(rule) ? owner : null; };
    const offSize = new Map();
    const identity = element => {
      if (element.id) return '#' + element.id;
      const parts = [];
      for (let node = element; node && node.nodeType === 1 && parts.length < 4; node = node.parentElement) {
        if (node.id) { parts.unshift('#' + node.id); break; }
        const same = node.parentElement ? [...node.parentElement.children].filter(child => child.tagName === node.tagName) : [];
        parts.unshift(node.tagName.toLowerCase() + (same.length > 1 ? `:nth-of-type(${same.indexOf(node) + 1})` : ''));
      }
      return parts.join(' > ');
    };
    const layers = value => value === 'none' ? [] : value.split(/,(?![^(]*\))/).map(part => part.trim());
    const blurred = value => layers(value).some(layer => { const lengths = layer.replace(/(rgba?|color|hsla?)\([^)]*\)/g, '').match(/-?[\d.]+px/g) || []; return parseFloat(lengths[2] || '0') > 0; });
    const partlyClear = value => [...value.matchAll(/rgba\([^)]*,\s*([\d.]+)\)|\/\s*([\d.]+)\)/g)].some(match => { const alpha = parseFloat(match[1] ?? match[2]); return alpha > 0 && alpha < 1; });
    const modernFonts = ['system-ui', '-apple-system', 'blinkmacsystemfont', 'segoe ui', 'segoe ui variable', 'roboto', 'inter', 'helvetica neue', 'sf pro text', 'sf pro display', 'ui-sans-serif', 'ui-rounded', 'san francisco', 'ubuntu', 'cantarell', 'noto sans'];
    const sides = ['Top', 'Right', 'Bottom', 'Left'];
    const corners = ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius'];
    const violations = [], ignored = [];
    const report = (element, rule, value, suffix = '') => {
      const owner = ignoreOwner(element, rule);
      if (owner) { const entry = { element: identity(owner), rule }; if (!ignored.some(item => item.element === entry.element && item.rule === rule)) ignored.push(entry); return; }
      violations.push({ rule, element: identity(element) + suffix, value: String(value).slice(0, 160) });
    };
    const shared = (element, style, suffix) => {
      const radius = corners.map(name => style[name]).find(value => value && value !== '0px');
      if (radius) report(element, 'rounded-corner', radius, suffix);
      if (blurred(style.boxShadow)) report(element, 'soft-shadow', style.boxShadow, suffix);
      if (blurred(style.textShadow)) report(element, 'soft-shadow', style.textShadow, suffix);
    };
    let checked = 0;
    for (const element of elements) {
      if (element.tagName === 'DIALOG') { const backdrop = getComputedStyle(element, '::backdrop').backgroundColor; if (backdrop && !/^(transparent|rgba\(0, 0, 0, 0\))$/.test(backdrop)) report(element, 'dimmed-backdrop', backdrop); }
      if (!visible(element) || element.ownerSVGElement) continue;
      checked++;
      const style = getComputedStyle(element);
      const size = parseFloat(style.fontSize);
      if (size > 0 && Math.abs(size - 11) > 0.01 && element.matches(textControls) && ownText(element)) {
        // Charge the size to the outermost ancestor that sets it, so one wrong body rule is one finding.
        let source = element;
        if (!ignoreOwner(element, 'control-text-size')) while (source.parentElement && getComputedStyle(source.parentElement).fontSize === style.fontSize && !source.parentElement.hasAttribute('data-gui95-lint-ignore')) source = source.parentElement;
        const entry = offSize.get(source) || { size: style.fontSize, count: 0 };
        entry.count++; offSize.set(source, entry);
      }
      shared(element, style, '');
      for (const pseudo of ['::before', '::after']) { const pseudoStyle = getComputedStyle(element, pseudo); if (pseudoStyle.content && pseudoStyle.content !== 'none' && pseudoStyle.content !== 'normal') shared(element, pseudoStyle, pseudo); }
      const borderColours = sides.filter(side => parseFloat(style[`border${side}Width`]) > 0).map(side => style[`border${side}Color`]).join(' ');
      if (parseFloat(style.opacity) < 1) report(element, 'translucency', 'opacity ' + style.opacity);
      else { const clear = [style.backgroundColor, style.color, borderColours, style.boxShadow, style.textShadow].find(partlyClear); if (clear) report(element, 'translucency', clear); }
      if (style.transitionDuration.split(',').some(value => parseFloat(value) > 0)) report(element, 'animation', 'transition ' + style.transitionProperty + ' ' + style.transitionDuration);
      if (style.animationName !== 'none') report(element, 'animation', 'animation ' + style.animationName);
      if (style.cursor === 'pointer' && !element.closest('a[href]')) report(element, 'pointer-cursor', 'cursor: pointer');
      const keyword = sides.find(side => parseFloat(style[`border${side}Width`]) > 0 && /^(outset|inset|groove|ridge)$/.test(style[`border${side}Style`]));
      const native = (element.matches('input[type=checkbox],input[type=radio],input[type=range],progress,meter') || (element.matches('select') && !element.multiple && element.size <= 1)) && style.appearance !== 'none' && !(element.matches('select') && style.appearance === 'base-select');
      if (native) report(element, 'native-control', 'appearance: ' + style.appearance);
      else if (keyword) report(element, 'keyword-bevel', `border-${keyword.toLowerCase()}-style: ${style[`border${keyword}Style`]}`);
      const family = style.fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '').toLowerCase();
      if (modernFonts.includes(family) && element.textContent.trim() && (element === roots[0] || getComputedStyle(element.parentElement).fontFamily !== style.fontFamily)) report(element, 'modern-font', style.fontFamily);
      if (style.backdropFilter && style.backdropFilter !== 'none') report(element, 'filter-effect', 'backdrop-filter: ' + style.backdropFilter);
      else if (/blur\(/.test(style.filter)) report(element, 'filter-effect', 'filter: ' + style.filter);
    }
    for (const [source, entry] of offSize) report(source, 'control-text-size', `font-size: ${entry.size} on ${entry.count} control${entry.count === 1 ? '' : 's'}`);
    return { scope: scoped.length ? '.gui95, [data-gui95]' : 'body (no .gui95 or [data-gui95] scope found)', scoped: scoped.length > 0, checked, violations, ignored };
  });
  const total = found.violations.length;
  return { schemaVersion: 1, scope: found.scope, scoped: found.scoped, checked: found.checked, status: total ? 'failed' : 'passed', violations: found.violations.slice(0, 300), truncated: Math.max(0, total - 300), ignored: found.ignored, limits };
}

/** Open an explicitly selected running URL in headless Chromium and lint it. Never starts a server. */
export async function runPeriodLint({ url } = {}) {
  let target;
  try { target = new URL(url); } catch { throw new TypeError('Provide an explicit http:// or https:// URL'); }
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) throw new TypeError('URL must use http:// or https:// without embedded credentials');
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
    await page.goto(target.href, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.evaluate(async () => { await Promise.race([document.fonts.ready, new Promise(done => setTimeout(done, 3000))]); await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))); });
    return { url: target.href, ...await lintPage(page) };
  } finally { await browser.close(); }
}

/** Group a report by rule for reading in a terminal. */
export function summarize(report) {
  const groups = new Map();
  for (const item of report.violations) { if (!groups.has(item.rule)) groups.set(item.rule, []); groups.get(item.rule).push(item); }
  const lines = [`Period lint ${report.status}: ${report.violations.length + report.truncated} violation(s) in ${report.checked} visible elements; scope ${report.scope}.`];
  for (const [rule, items] of groups) {
    lines.push('', `${rule} (${items.length}): ${RULES[rule]}`);
    for (const item of items.slice(0, 8)) lines.push(`  ${item.element}  ${item.value}`);
    if (items.length > 8) lines.push(`  … and ${items.length - 8} more`);
  }
  if (report.ignored.length) lines.push('', 'Ignored by data-gui95-lint-ignore: ' + report.ignored.map(item => `${item.element} (${item.rule})`).join(', '));
  lines.push('', ...report.limits.map(text => 'Note: ' + text));
  return lines.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), json = args.includes('--json'), url = args.find(arg => !arg.startsWith('--'));
  if (!url) { process.stderr.write('Usage: node kit/verify/period-lint.mjs URL [--json]\n'); process.exitCode = 2; }
  else try { const report = await runPeriodLint({ url }); process.stdout.write((json ? JSON.stringify(report, null, 2) : summarize(report)) + '\n'); if (report.status === 'failed') process.exitCode = 1; } catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 2; }
}
