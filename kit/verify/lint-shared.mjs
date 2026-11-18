/** Shared plumbing for the wording and layout lints: in-page helpers, the URL runner, the readable summary and the command line. */

/**
 * Runs inside the page. Returns the helpers both lints use, following the period lint's conventions:
 * the .gui95 / [data-gui95] scope, visibility, element identity and the data-gui95-lint-ignore opt-out.
 * Must stay self-contained: it is serialised with toString().
 */
export function pageHelpers() {
  const scoped = [...document.querySelectorAll('.gui95,[data-gui95]')];
  const roots = scoped.length ? scoped : [document.body];
  const elements = [...new Set(roots.flatMap(root => [root, ...root.querySelectorAll('*')]))].filter(element => !['SCRIPT', 'STYLE', 'LINK', 'META', 'TITLE', 'HEAD'].includes(element.tagName) && !element.ownerSVGElement);
  const visible = element => !!element.getClientRects().length && element.checkVisibility({ visibilityProperty: true, opacityProperty: true });
  const all = selector => elements.filter(element => element.matches(selector) && visible(element));
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
  const violations = [], ignored = [];
  const report = (element, rule, value) => {
    const owner = element.closest('[data-gui95-lint-ignore]');
    if (owner && owner.getAttribute('data-gui95-lint-ignore').split(/\s+/).includes(rule)) {
      const entry = { element: identity(owner), rule };
      if (!ignored.some(item => item.element === entry.element && item.rule === rule)) ignored.push(entry);
      return;
    }
    violations.push({ rule, element: identity(element), value: String(value).slice(0, 200) });
  };
  /** English unless an ancestor says otherwise; translate="no" marks names and codes that are not wording. */
  const english = element => {
    const language = element.closest('[lang]'), fixed = element.closest('[translate]');
    if (language && language.getAttribute('lang').trim() && !/^en(-|$)/i.test(language.getAttribute('lang').trim())) return false;
    return !(fixed && fixed.getAttribute('translate').toLowerCase() === 'no');
  };
  const notLabel = '[data-gui95-shortcut],kbd,input,select,textarea,button,[aria-hidden="true"],.mark,[data-gui95-disclosure],svg,img,script,style';
  /** A control's label text without its shortcut, marks, icons and nested controls. Text after a tab character is the shortcut. */
  const labelParts = (element, stopAt = null) => {
    if (element.matches('input')) return { text: (element.value || '').replace(/\s+/g, ' ').trim(), shortcut: '' };
    let text = '', stopped = false;
    const walk = node => {
      for (const child of node.childNodes) {
        if (stopped) return;
        if (child === stopAt) { stopped = true; return; }
        if (child.nodeType === 3) text += child.textContent;
        else if (child.nodeType === 1 && !child.matches(notLabel) && (child.getClientRects().length || child.tagName === 'U')) walk(child);
        else if (child.nodeType === 1 && stopAt && child.contains(stopAt)) walk(child);
      }
    };
    walk(element);
    const [label, ...rest] = text.split('\t');
    const marked = element.querySelector('[data-gui95-shortcut],kbd');
    return { text: label.replace(/\s+/g, ' ').trim(), shortcut: (marked ? marked.textContent : rest.join(' ')).replace(/\s+/g, ' ').trim() };
  };
  /** The access key a label advertises: accesskey, data-gui95-mnemonic, or its underlined letter. */
  const accessKey = element => {
    const underlined = element.querySelector('u');
    const key = element.getAttribute('accesskey') || element.getAttribute('data-gui95-mnemonic') || (underlined && underlined.textContent.trim().length === 1 ? underlined.textContent.trim() : '');
    return (key || '').toLowerCase();
  };
  const dialogs = 'dialog,[role=dialog],[role=alertdialog]';
  const pushButtons = 'button,[role=button],input[type=button],input[type=submit],input[type=reset]';
  /** A command button: not a menu item, tab, title bar button, up-down arrow, tree sign or column heading. */
  const isCommandButton = element => element.matches(pushButtons) && (!element.hasAttribute('role') || element.getAttribute('role') === 'button')
    && !element.matches('[data-gui95-step],[data-gui95-disclosure],[data-gui95-menu]')
    && !element.closest('[role=menubar],[data-gui95-menubar],[role=menu],[role=tablist],.title-bar,th,[role=columnheader],[data-gui95-spin]');
  return { scoped: scoped.length > 0, scope: scoped.length ? '.gui95, [data-gui95]' : 'body (no .gui95 or [data-gui95] scope found)', roots, elements, visible, all, identity, report, violations, ignored, english, labelParts, accessKey, dialogs, isCommandButton };
}

/** Turn in-page results into a report. Findings are warnings unless a rule's severity is error or strict is set. */
export function buildReport(name, found, { severity, limits, strict = false, skip = [] }) {
  for (const rule of skip) if (!(rule in severity)) throw new TypeError(`Unknown ${name} lint rule: ${rule}`);
  const kept = found.violations.filter(item => !skip.includes(item.rule)).map(item => ({ rule: item.rule, severity: severity[item.rule], element: item.element, value: item.value }));
  const failed = kept.some(item => item.severity === 'error') || (strict && kept.length > 0);
  return { schemaVersion: 1, lint: name, scope: found.scope, scoped: found.scoped, checked: found.checked, strict, skipped: [...skip], status: failed ? 'failed' : kept.length ? 'warnings' : 'passed', violations: kept.slice(0, 300), truncated: Math.max(0, kept.length - 300), ignored: found.ignored.filter(item => !skip.includes(item.rule)), limits };
}

/** Open an explicitly selected running URL in headless Chromium and hand the page to a lint. Never starts a server. */
export async function withPage(url, callback) {
  let target;
  try { target = new URL(url); } catch { throw new TypeError('Provide an explicit http:// or https:// URL'); }
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) throw new TypeError('URL must use http:// or https:// without embedded credentials');
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
    await page.goto(target.href, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.evaluate(async () => { await Promise.race([document.fonts.ready, new Promise(done => setTimeout(done, 3000))]); await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))); });
    return { url: target.href, ...await callback(page) };
  } finally { await browser.close(); }
}

/** Group a report by rule for reading in a terminal. */
export function summarizeReport(title, rules, report) {
  const groups = new Map();
  for (const item of report.violations) { if (!groups.has(item.rule)) groups.set(item.rule, []); groups.get(item.rule).push(item); }
  const total = report.violations.length + report.truncated;
  const lines = [`${title} ${report.status}: ${total} finding(s) in ${report.checked} ${report.checkedUnit || 'items'}; scope ${report.scope}.${report.status === 'warnings' ? ' Findings are warnings; pass --strict to exit 1 on them.' : ''}`];
  for (const [rule, items] of groups) {
    lines.push('', `${rule} (${items.length}, ${items[0].severity}): ${rules[rule]}`);
    for (const item of items.slice(0, 8)) lines.push(`  ${item.element}  ${item.value}`);
    if (items.length > 8) lines.push(`  … and ${items.length - 8} more`);
  }
  if (report.skipped.length) lines.push('', 'Skipped by --skip: ' + report.skipped.join(', '));
  if (report.ignored.length) lines.push('', 'Ignored by data-gui95-lint-ignore: ' + report.ignored.map(item => `${item.element} (${item.rule})`).join(', '));
  lines.push('', ...report.limits.map(text => 'Note: ' + text));
  return lines.join('\n');
}

/** Shared command line: URL [--json] [--strict] [--skip rule,rule]. Returns the exit status: 0, 1 (failed) or 2 (bad arguments). */
export async function lintCommand(args, { usage, run, summarize, write = text => process.stdout.write(text), fail = text => process.stderr.write(text) }) {
  const rest = [...args], skipAt = rest.indexOf('--skip');
  const skip = skipAt < 0 ? [] : (rest.splice(skipAt, 2)[1] || '').split(',').map(rule => rule.trim()).filter(Boolean);
  const json = rest.includes('--json'), strict = rest.includes('--strict'), url = rest.find(arg => !arg.startsWith('--'));
  if (!url) { fail(`Usage: ${usage} URL [--json] [--strict] [--skip RULE,RULE]\n`); return 2; }
  try {
    const report = await run({ url, strict, skip });
    write((json ? JSON.stringify(report, null, 2) : summarize(report)) + '\n');
    return report.status === 'failed' ? 1 : 0;
  } catch (error) { fail(error.message + '\n'); return 2; }
}
