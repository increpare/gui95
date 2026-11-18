import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { pageHelpers, buildReport, withPage, summarizeReport, lintCommand } from './lint-shared.mjs';

const MOS = 'Microsoft Manual of Style, 1995', WIG = 'Windows Interface Guidelines, final 1995';
/**
 * Each rule names a wording tell, the period form, and where the rule comes from:
 * "stated" means the source says it about interface text, "inferred" that it was drawn from
 * documentation practice or the source's screen shots. English interface text only.
 */
export const RULES = Object.freeze({
  'menu-title-caps': `Menu names and menu commands use title caps: capitalize every word except articles, coordinating conjunctions and short prepositions inside the label ("Save As", "Move or Copy Sheet"). ${MOS}: stated about the interface as documentation reproduces it, and confirmed by its screen shots.`,
  'button-title-caps': `Command button labels use title caps ("New Query", "Change Icon"). ${MOS}: a documentation convention describing interface practice.`,
  'dialog-title-caps': `Dialog box titles use title caps ("Protect Document") and usually repeat the command that opened them. ${MOS}: stated.`,
  'ellipsis-form': `An ellipsis is three periods closed up against the label ("Find..."), with no space before it or between the dots, and never two or four. ${MOS}: the use of the ellipsis is stated about the interface; the exact form is inferred from its screen shots and Appendix B.`,
  'ellipsis-character': `Write the ellipsis as three periods ("Options...") rather than the single character U+2026. Inferred, low confidence: the ${MOS} screen shots are spaced like three periods and Windows 95 strings used three periods, but print cannot settle it. Skip with --skip ellipsis-character if the application chooses the single character.`,
  'shortcut-key-format': `Shortcut keys in menus read "Ctrl+S", "Ctrl+Shift+N", "Alt+F4", "F5", "Del": modifiers Ctrl, Alt and Shift with an initial capital, joined by plus signs with no spaces, and a capital letter key. ${MOS}: the plus sign is stated; mixed case in menus is inferred from its screen shots.`,
  'label-colon-missing': `The label of a text box, list box, drop-down list or spin box ends with a colon ("File name:"). ${WIG} (static text and accessibility sections): stated about interface text. ${MOS} screen shots agree.`,
  'label-colon-unexpected': `Check box, option button, command button, tab and group box labels carry no colon. ${WIG}: stated (the colon applies unless the label is on a button, tab or group box); for check boxes and option buttons inferred from the ${MOS} screen shots.`,
  'ok-button-spelling': `The button is spelled "OK", never "Ok", "ok" or "Okay". ${MOS}: stated as the interface's spelling.`,
  'exit-not-quit': `The command that ends a program is named Exit; Close is for windows and documents. ${MOS}: stated as the command's name.`,
  'period-vocabulary': `Use the period term. ${MOS}: each replacement is stated for documentation and applies to interface text by inference, so read the finding as a prompt, not a verdict. Page numbers are PDF pages; the printed folio is eight less.`,
  'message-blames-user': `Do not make the user the subject of an error message ("You cannot..."); name the thing that failed ("The printer on LPT1 is not responding."). ${MOS}: stated about error messages.`,
  'message-question-symbol': `Do not use the question-mark message symbol; users confuse it with Help. Use the information, warning or critical symbol. ${WIG} (message box types) and ${MOS}: stated about the interface.`
});
/** Every rule warns by default. Pass strict to make any finding fail. */
export const SEVERITY = Object.freeze(Object.fromEntries(Object.keys(RULES).map(rule => [rule, 'warn'])));

/**
 * Title caps word lists (Manual of Style 1995: articles, coordinating conjunctions and prepositions of
 * four or fewer letters stay lower case unless first or last).
 * lower: must be lower case inside a label. either: words that are prepositions in some commands and
 * adverbs in others ("Keep Help on Top" but "Log On to Network"), so either case is accepted inside a label.
 */
export const SMALL_WORDS = Object.freeze({
  lower: Object.freeze(['a', 'an', 'the', 'and', 'but', 'nor', 'or', 'for', 'of', 'to', 'at', 'by', 'as', 'from', 'with', 'into', 'per', 'via']),
  either: Object.freeze(['in', 'on', 'off', 'up', 'out', 'over', 'down', 'onto', 'upon', 'near', 'past', 'like', 'than', 'plus'])
});

/**
 * Test one label against title caps. Returns { skipped: reason } when the label is not judged,
 * otherwise { problems: [{ word, expected }] } (empty when the label is correct).
 * Self-contained: it also runs inside the page.
 */
export function titleCaps(label, words = SMALL_WORDS) {
  let text = String(label).replace(/\s+/g, ' ').trim();
  if (/ - /.test(text)) text = text.slice(0, text.indexOf(' - '));
  text = text.replace(/\s*(\.{2,}|…|>>|<<|:)\s*$/, '').trim();
  if (!/\p{L}/u.test(text)) return { skipped: 'no letters' };
  if (/^\([^()]*\)$/.test(text)) return { skipped: 'parenthesized placeholder' };
  // A parenthesized remark such as "(unavailable)" annotates the label and is not part of the command name.
  text = text.replace(/\s*\([^()]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  if (/^\d+\s/.test(text)) return { skipped: 'numbered entry such as a recent file' };
  if (/[.?!]$/.test(text) || /[.?!,;] /.test(text)) return { skipped: 'sentence' };
  const raw = text.replace(/(?<=^|\s)(["“'‘])[^"”'’]*(["”'’])(?=\s|$)/g, ' ').split(' ').filter(Boolean);
  if (raw.length > 8) return { skipped: 'more than eight words' };
  const isLower = letter => letter !== letter.toUpperCase() && letter === letter.toLowerCase();
  const isUpper = letter => letter !== letter.toLowerCase() && letter === letter.toUpperCase();
  const candidates = [];
  for (const token of raw) {
    // A file name, path, address or version is user data or a proper name: leave the whole token alone.
    if (/[\\@_]|:\/|^[A-Za-z]:|\.[\p{L}\d]/u.test(token)) { candidates.push(null); continue; }
    for (const part of token.split('/')) {
      const word = part.replace(/^[^\p{L}\d]+|[^\p{L}\d]+$/gu, '');
      const head = word.split('-')[0];
      candidates.push(head && /^\p{L}/u.test(head) ? head : null);
    }
  }
  const judged = candidates.filter(Boolean);
  if (!judged.length) return { skipped: 'no judged words' };
  const letters = word => [...word].filter(letter => /\p{L}/u.test(letter));
  const shouting = judged.filter(word => letters(word).length > 1 && letters(word).every(isUpper));
  if (judged.length > 1 && shouting.length === judged.length && judged.some(word => word.length >= 4)) return { problems: [{ word: text, expected: 'title caps, not all capitals' }] };
  const problems = [];
  candidates.forEach((word, index) => {
    if (!word) return;
    const first = word[0], small = word.toLowerCase(), edge = index === 0 || index === candidates.length - 1;
    const capital = first.toUpperCase() + word.slice(1);
    // Capitals after the first letter mark an acronym or a name with its own casing: OK, ASCII, WordPad, ToolTip.
    if ([...word.slice(1)].some(isUpper)) return;
    if (edge) { if (isLower(first)) problems.push({ word, expected: capital }); return; }
    if (words.lower.includes(small)) { if (isUpper(first)) problems.push({ word, expected: small }); return; }
    if (words.either.includes(small)) return;
    if (isLower(first)) problems.push({ word, expected: capital });
  });
  return { problems };
}

/** Test shortcut text from a menu. Returns '' when it has the period form, otherwise what is wrong. Self-contained. */
export function shortcutProblem(shortcut) {
  const text = String(shortcut).trim();
  if (!text) return '';
  if (/[⌘⌥⇧⌃^]/.test(text)) return 'modifier glyph; write Ctrl, Alt or Shift';
  if (/\s\+|\+\s/.test(text)) return 'spaces round the plus sign';
  const parts = text.split('+');
  // "Ctrl++" is Ctrl with the plus key.
  if (parts.length > 2 && parts.at(-1) === '' && parts.at(-2) === '') parts.splice(-2, 2, '+');
  const key = parts.pop(), modifiers = parts;
  if (!modifiers.length && /^(ctrl|control|alt|shift|cmd|command|option|meta|win|super)[\s-]/i.test(text)) return 'join key names with a plus sign and no spaces';
  for (const modifier of modifiers) {
    if (['Ctrl', 'Alt', 'Shift'].includes(modifier)) continue;
    if (/^(ctrl|alt|shift)$/i.test(modifier)) return `"${modifier}" should be "${modifier[0].toUpperCase() + modifier.slice(1).toLowerCase()}"`;
    if (/^control$/i.test(modifier)) return `"${modifier}" should be "Ctrl"`;
    return `"${modifier}" is not a Windows 95 modifier; use Ctrl, Alt or Shift`;
  }
  if (key === '') return 'no key after the plus sign';
  if ([...key].length === 1) return /\p{Ll}/u.test(key) ? `letter key "${key}" should be "${key.toUpperCase()}"` : '';
  if (/^F\d{1,2}$/.test(key)) return '';
  if (/^[A-Z][a-z]+([A-Z][a-z]+)?( ([A-Z][a-z]+|[0-9+\-*\/.]))?$/.test(key)) return '';
  if (/^f\d{1,2}$/.test(key)) return `"${key}" should be "${key.toUpperCase()}"`;
  if (/^[A-Za-z]+-[A-Za-z0-9]+$/.test(key)) return 'join key names with a plus sign, not a hyphen';
  return `key name "${key}" should have an initial capital only, as in Del, Enter, PgUp`;
}

/**
 * Period vocabulary from the Manual of Style terminology entries. match is a case-insensitive
 * pattern source (case-sensitive when exact is set); page is the PDF page of the entry.
 */
export const VOCABULARY = Object.freeze([
  ['radio buttons?', 'option button', 203], ['context menus?', 'shortcut menu', 49], ['pop-?up menus?', 'shortcut menu', 221], ['pop-?up windows?', 'dialog box', 58],
  ['cascading menus?|hierarchical menus?|secondary menus?', 'submenu', 228], ['pull-?down menus?', 'menu', 200],
  ['deselect(s|ed|ing)?|unselect(s|ed|ing)?', 'cancel the selection, or clear for a check box', 57], ['uncheck(s|ed|ing)?|unmark(s|ed|ing)?', 'clear', 250],
  ['log ?in|logged in|log ?out|logged out|sign[ -]?in|sign[ -]?out|sign[ -]?on|sign[ -]?off', 'log on / log off', 135],
  ['emails?', 'e-mail', 73], ['spinners?', 'spin box', 62], ['dialogues?', 'dialog box', 58], ['click(s|ed|ing)? on', 'click', 37],
  ['hit(s|ting)? (the |any |a )?(\\w+ )?key|hit(s|ting)? (enter|return|esc|escape|tab|space|ctrl|alt|f\\d+)', 'press', 191],
  ['abort(s|ed|ing)?', 'quit, cancel or stop', 10], ['terminat(e|es|ed|ing)', 'quit, end or stop', 239],
  ['crash(es|ed|ing)?|lock(s|ed)? up|has hung|is hung|hangs', 'stop responding (a program) or fail (a disk)', 89],
  ['wish(es)? to|desire(s|d)?', 'want', 257], ['e\\.g\\.', 'for example', 72], ['i\\.e\\.', 'that is', 72], ['etc\\.?', 'and so on', 72],
  ['table of contents', 'Contents', 233], ['hard drives?', 'hard disk', 89], ['diskettes?', 'disk', 65], ['(sub)?director(y|ies)', 'folder', 80],
  ['undelet(e|es|ed|ing)', 'restore', 250], ['deinstall(s|ed|ing)?', 'remove', 57], ['status line|message area', 'status bar', 226],
  ['gr[ae]yed( out)?', 'unavailable (the state) or dimmed (the look)', 87], ['entry fields?|text fields?|input fields?', 'text box', 239],
  ['hot ?keys?|accelerator keys?|fast keys?|quick keys?|speed keys?', 'shortcut key', 122], ['mouse cursors?', 'pointer', 153],
  ['direction(al)? keys?|movement keys?', 'arrow keys', 119], ['search and replace', 'find and replace', 217], ['push ?buttons?', 'command button, or the button\'s name', 201],
  ['checkbox(es)?', 'check box (two words)', 36], ['[Tt]ooltips?|[Tt]ool tips?', 'ToolTip', 245, true]
].map(([match, use, page, exact = false]) => Object.freeze({ match, use, page, exact })));

/** Rules from the notes that are deliberately not implemented, and why. Kept here so the README and tests agree. */
export const OMITTED = Object.freeze({
  'option-label-case-mixed': 'Label capitalization inside dialogs: the Manual of Style never defines "initial cap" and its own examples disagree.',
  'tab-title-caps': 'Tab label capitalization: the final Windows Interface Guidelines say book-title caps in two places and sentence caps in a third.',
  'ellipsis-on-checked-command': 'Inferred with low confidence.',
  'message-punctuation': 'Inferred from three examples; the manual is silent on exclamation points.',
  'status-bar-command-help': 'The lint changes nothing on the page, so it cannot highlight a command to read its status bar text.',
  'size-units': 'The manual\'s documentation rule ("360K") is contradicted by its own interface screen shot ("12 KB").',
  'screen-resolution-form': 'Stated for documentation only; low confidence for interface text.'
});

const limits = Object.freeze([
  'English only. Text inside an element whose lang is not English, or marked translate="no", is not judged.',
  'Only visible text is read; open each menu, dialog and tab page you want checked before linting.',
  'User content is skipped: text boxes and their values, list, tree and table items, and editable documents. Mark other user content with data-gui95-lint-ignore naming the rules.',
  'Title caps follow a word list and cannot tell a preposition from an adverb; proper names, acronyms and file names are accepted as written.',
  'Most rules come from documentation practice, so every finding is a warning. A clean report does not establish that the wording is right.'
]);

/** Runs inside the page. Self-contained apart from its arguments. */
function wordingInPage(h, titleCaps, shortcutProblem, config) {
  const userContent = '[contenteditable]:not([contenteditable=false]),[role=listbox],[role=tree],[data-gui95-tree],[role=grid],[role=treegrid],[role=table],table,[role=document],[role=textbox],[role=log],textarea,select';
  const chrome = element => h.english(element) && !element.closest(userContent);
  const quote = text => JSON.stringify(text.length > 70 ? text.slice(0, 67) + '...' : text);
  let checked = 0;
  const caps = (element, rule, text) => {
    const result = titleCaps(text, config.words);
    if (result.problems && result.problems.length) h.report(element, rule, `${quote(text)}: ${result.problems.map(item => `"${item.word}" should be ${/ /.test(item.expected) ? item.expected : `"${item.expected}"`}`).join('; ')}`);
  };
  const ellipsis = (element, text) => {
    if (/…\s*$/.test(text)) h.report(element, 'ellipsis-character', quote(text));
    if (/\s(\.{2,}|…)\s*$/.test(text)) h.report(element, 'ellipsis-form', `${quote(text)}: space before the ellipsis`);
    else if (/\.\s+\.[\s.]*$/.test(text)) h.report(element, 'ellipsis-form', `${quote(text)}: spaced dots`);
    else if (/\p{L}\.\.$/u.test(text) || /\.{4,}$/.test(text)) h.report(element, 'ellipsis-form', `${quote(text)}: ${/\.{4,}$/.test(text) ? 'four or more' : 'two'} dots`);
  };
  const judged = new Set();
  const take = element => { judged.add(element); checked++; return h.labelParts(element); };

  const inMenubar = '[role=menubar],[data-gui95-menubar]';
  for (const element of h.all(`:is(${inMenubar}) > :is(button,[role=menuitem])`).filter(chrome)) { const { text } = take(element); if (text) { caps(element, 'menu-title-caps', text); ellipsis(element, text); } }
  for (const element of h.all('[role=menu] :is([role=menuitem],[role=menuitemcheckbox],[role=menuitemradio])').filter(chrome)) {
    const { text, shortcut } = take(element);
    if (!text) continue;
    caps(element, 'menu-title-caps', text); ellipsis(element, text);
    const wrong = shortcutProblem(shortcut);
    if (wrong) h.report(element, 'shortcut-key-format', `${quote(shortcut)}: ${wrong}`);
    if (/^(quit|close program|exit application)\b/i.test(text)) h.report(element, 'exit-not-quit', quote(text));
  }
  for (const element of h.elements.filter(element => h.isCommandButton(element) && h.visible(element) && chrome(element))) {
    const { text } = take(element);
    if (!text) continue;
    caps(element, 'button-title-caps', text); ellipsis(element, text);
    if (/^ok(ay)?$/i.test(text) && text !== 'OK') h.report(element, 'ok-button-spelling', quote(text));
    if (/:$/.test(text)) h.report(element, 'label-colon-unexpected', `${quote(text)} on a command button`);
  }
  for (const element of h.all('[role=tab]').filter(chrome)) { const { text } = take(element); if (/:$/.test(text)) h.report(element, 'label-colon-unexpected', `${quote(text)} on a tab`); }
  for (const element of h.all('legend,.group-box > .group-box-label').filter(chrome)) { const { text } = take(element); if (/:$/.test(text)) h.report(element, 'label-colon-unexpected', `${quote(text)} on a group box`); }

  const titleOf = dialog => (dialog.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => id && document.getElementById(id)).find(Boolean) || dialog.querySelector('.title-bar');
  const visibleDialogs = h.all(h.dialogs);
  for (const dialog of visibleDialogs) {
    const title = titleOf(dialog);
    if (title && h.visible(title) && chrome(title)) { const { text } = take(title); if (text) caps(title, 'dialog-title-caps', text); }
    else if (!title && dialog.getAttribute('aria-label') && h.english(dialog)) { checked++; caps(dialog, 'dialog-title-caps', dialog.getAttribute('aria-label').trim()); }
    for (const image of dialog.querySelectorAll('img,svg,[role=img],[data-icon],[class*=icon]')) {
      if (!h.visible(image) || image.closest('button,a')) continue;
      const use = image.querySelector && image.querySelector('use');
      const described = ['src', 'alt', 'class', 'data-icon', 'aria-label', 'id', 'title'].map(name => image.getAttribute(name) || '').join(' ') + ' ' + (use ? use.getAttribute('href') || '' : '');
      if (/question|help-?mark/i.test(described)) h.report(image, 'message-question-symbol', described.replace(/\s+/g, ' ').trim());
    }
  }

  // Labels bound to controls: <label for>, a wrapping <label>, or aria-labelledby.
  const fields = 'input:not([type=checkbox],[type=radio],[type=button],[type=submit],[type=reset],[type=image],[type=hidden],[type=range],[type=color],[type=file]),select,textarea,[role=listbox],[role=combobox],[role=spinbutton],[role=textbox]';
  const checks = 'input[type=checkbox],input[type=radio],[role=checkbox],[role=radio],[role=switch]';
  const pairs = [];
  for (const label of h.all('label')) if (label.control) pairs.push([label, label.control]);
  for (const control of h.elements.filter(element => element.matches(`:is(${fields},${checks})[aria-labelledby]`))) for (const id of control.getAttribute('aria-labelledby').split(/\s+/)) { const label = id && document.getElementById(id); if (label && label.tagName !== 'LABEL' && h.visible(label)) pairs.push([label, control]); }
  for (const [label, control] of pairs) {
    if (!h.english(label) || label.closest('[contenteditable]:not([contenteditable=false]),table,[role=grid]') || !h.visible(control)) continue;
    const box = label.getBoundingClientRect();
    if (box.width < 2 || box.height < 2) continue;
    judged.add(label); checked++;
    if (control.matches(checks)) { const { text } = h.labelParts(label); if (/:$/.test(text)) h.report(label, 'label-colon-unexpected', `${quote(text)} on ${control.matches('[type=radio],[role=radio]') ? 'an option button' : 'a check box'}`); continue; }
    if (!control.matches(fields)) continue;
    // A wrapping label is judged on the text before its control; trailing text is a unit such as "pixels".
    const { text } = h.labelParts(label, label.contains(control) ? control : null);
    if (text && !/:$/.test(text)) h.report(label, 'label-colon-missing', quote(text));
  }

  // Vocabulary and message tone are read from interface text: controls judged above, and static text in dialogs, status bars and ToolTips.
  const zones = `${h.dialogs},[role=status],.status-bar,[role=tooltip],[role=alert],.title-bar`;
  const vocabulary = config.vocabulary.map(item => ({ ...item, pattern: new RegExp(`(?<![\\p{L}\\d-])(${item.match})(?![\\p{L}\\d-])`, item.exact ? 'u' : 'iu') }));
  const texts = [...judged].map(element => [element, h.labelParts(element).text]);
  const messages = [];
  for (const element of h.elements) {
    if (judged.has(element) || !element.closest(zones) || !chrome(element) || element.closest('button,label,legend,[role=tab],[role^=menuitem],a') || !h.visible(element)) continue;
    const own = [...element.childNodes].filter(node => node.nodeType === 3).map(node => node.textContent).join(' ').replace(/\s+/g, ' ').trim();
    if (!own) continue;
    checked++; texts.push([element, own]);
    if (element.closest(`${h.dialogs},[role=alert]`) && !element.closest('.title-bar')) messages.push([element, own]);
  }
  for (const [element, text] of texts) for (const item of vocabulary) { const match = text.match(item.pattern); if (match) h.report(element, 'period-vocabulary', `"${match[1]}" → ${item.use} (p. ${item.page}) in ${quote(text)}`); }
  for (const [element, text] of messages) {
    const blamed = text.split(/(?<=[.?!])\s+/).find(sentence => /^You (cannot|can't|can not|are unable|are not able|aren't able|don't|do not|have not|haven't|failed|did not|didn't)\b/i.test(sentence));
    if (blamed) h.report(element, 'message-blames-user', quote(blamed));
  }
  return { scope: h.scope, scoped: h.scoped, checked, violations: h.violations, ignored: h.ignored };
}

/** Inspect an already loaded Playwright page. Read-only: nothing is clicked, focused or changed. */
export async function lintPage(page, { strict = false, skip = [] } = {}) {
  const found = await page.evaluate(`(${wordingInPage})((${pageHelpers})(), ${titleCaps}, ${shortcutProblem}, ${JSON.stringify({ words: SMALL_WORDS, vocabulary: VOCABULARY })})`);
  return { ...buildReport('wording', found, { severity: SEVERITY, limits, strict, skip }), checkedUnit: 'pieces of interface text' };
}

/** Open an explicitly selected running URL in headless Chromium and lint its wording. Never starts a server. */
export const runWordingLint = ({ url, strict = false, skip = [] } = {}) => withPage(url, page => lintPage(page, { strict, skip }));

/** Group a report by rule for reading in a terminal. */
export const summarize = report => summarizeReport('Wording lint', RULES, report);

export const main = (args, io = {}) => lintCommand(args, { usage: 'node kit/verify/wording-lint.mjs', run: runWordingLint, summarize, ...io });

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = await main(process.argv.slice(2));
