import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { lintPage, runWordingLint, summarize, main, titleCaps, shortcutProblem, RULES, SEVERITY, VOCABULARY, OMITTED } from '../verify/wording-lint.mjs';
import { html, startFixture, rulesFor } from './lint-fixture.mjs';
const pages = new Map();
const item = (id, label, shortcut = '') => `<button role="menuitem" id="${id}">${label}${shortcut ? `<span data-gui95-shortcut>${shortcut}</span>` : ''}</button>`;
pages.set('/clean', html(`<div class="gui95">
<nav data-gui95-menubar><button data-gui95-menu="file-menu" data-gui95-mnemonic="f"><u>F</u>ile</button><button>Edit</button></nav>
<div id="file-menu" role="menu">${item('new', 'New', 'Ctrl+N')}${item('save-as', 'Save <u>A</u>s...', 'Ctrl+Shift+S')}${item('top', 'Keep Help on Top')}${item('log', 'Log On to Network...')}${item('recent', '1 letter to anna.txt')}${item('none', '(No recent files)')}${item('find', 'Find Next', 'F3')}${item('cut', 'Delete', 'Del')}${item('exit', 'Exit', 'Alt+F4')}</div>
<dialog open aria-labelledby="clean-title"><div class="title-bar" id="clean-title">Save As</div><div class="body">
<label for="name">File name:</label><input id="name" value="click on the radio button to log in">
<label><input type="checkbox"> Read only</label><label><input type="radio" name="r"> Portrait</label>
<label>Copies: <input type="number" value="1"> pages</label>
<span id="types-label">Save as type:</span><ul role="listbox" aria-labelledby="types-label"><li role="option">checkbox spinner (login)</li></ul>
<fieldset><legend>Advanced settings</legend><textarea aria-label="Notes">you cannot abort etc.</textarea></fieldset>
<div role="tablist"><button role="tab">General</button></div>
<p>The file could not be found. Make sure you typed it correctly and try again.</p>
<div class="actions"><button class="default">OK</button><button>Cancel</button><button>Browse...</button><button>Change Icon...</button><button>Profiles &gt;&gt;</button></div></div></dialog>
<div role="status">Creates a new document or template.</div></div>`));
pages.set('/tells', html(`<div class="gui95">
<nav data-gui95-menubar><button id="m-name">file</button></nav>
<div role="menu">${item('m-cmd', 'Save as...')}${item('m-and', 'Save And Close')}${item('sc-case', 'Save', 'CTRL+S')}${item('sc-space', 'Copy', 'Ctrl + C')}${item('sc-hyphen', 'Cut', 'Ctrl-X')}${item('sc-glyph', 'Paste', '⌘V')}${item('sc-lower', 'Undo', 'Ctrl+z')}${item('sc-good', 'Redo', 'Ctrl+Y')}${item('quit', 'Quit')}</div>
<div role="menu" hidden>${item('hidden-item', 'not shown', 'CTRL+Q')}</div>
<dialog open aria-labelledby="d-title"><div class="title-bar" id="d-title">Save as</div><div class="body">
<label id="l-missing" for="name">File name</label><input id="name">
<label id="l-check"><input type="checkbox"> Read only:</label>
<span id="l-aria">Fonts</span><ul role="listbox" aria-labelledby="l-aria"><li role="option" id="user-item">radio button</li></ul>
<fieldset><legend id="g-colon">Options:</legend></fieldset>
<div role="tablist"><button role="tab" id="t-colon">General:</button></div>
<p id="vocab">Click on the radio button, then press Enter.</p>
<p id="blame">The disk is full. You cannot save this file.</p>
<p id="must">You must restart Windows before the new settings take effect.</p>
<img id="qmark" alt="Question" width="32" height="32" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">
<div class="actions"><button id="b-caps">Save changes</button><button id="el-space">Browse ...</button><button id="el-two">Find..</button><button id="el-char">Options…</button><button id="okay">Ok</button><button id="b-colon">Browse:</button>
<button id="allowed" data-gui95-lint-ignore="button-title-caps">Save changes</button><button id="german" lang="de">Datei öffnen</button><button id="fixed" translate="no">gui95 demo</button></div></div></dialog>
</div><button id="outside">outside the scope…</button>`));
pages.set('/german', html('<div class="gui95" lang="de"><button>Datei öffnen</button><label for="x">Name</label><input id="x"></div>').replace('<html lang="en">', '<html lang="de">'));
let fixture;
before(async () => { fixture = await startFixture(pages); });
after(async () => { await fixture?.close(); });

test('period wording has no findings, and user content is not read', async () => {
  const report = await fixture.lint(lintPage, '/clean');
  assert.deepEqual(report.violations, []);
  assert.equal(report.status, 'passed');
  assert.equal(report.lint, 'wording');
  assert.ok(report.checked >= 20, 'interface text was read');
});
test('each wording tell is reported against its own element', async () => {
  const report = await fixture.lint(lintPage, '/tells');
  const expected = { 'm-name': 'menu-title-caps', 'm-cmd': 'menu-title-caps', 'm-and': 'menu-title-caps', 'sc-case': 'shortcut-key-format', 'sc-space': 'shortcut-key-format', 'sc-hyphen': 'shortcut-key-format', 'sc-glyph': 'shortcut-key-format', 'sc-lower': 'shortcut-key-format', quit: 'exit-not-quit', 'b-caps': 'button-title-caps', 'el-space': 'ellipsis-form', 'el-two': 'ellipsis-form', 'el-char': 'ellipsis-character', okay: 'ok-button-spelling', 'b-colon': 'label-colon-unexpected', 'd-title': 'dialog-title-caps', 'l-missing': 'label-colon-missing', 'l-aria': 'label-colon-missing', 'l-check': 'label-colon-unexpected', 'g-colon': 'label-colon-unexpected', 't-colon': 'label-colon-unexpected', vocab: 'period-vocabulary', blame: 'message-blames-user', qmark: 'message-question-symbol' };
  for (const [id, rule] of Object.entries(expected)) assert.deepEqual(rulesFor(report, id).filter((value, index, list) => list.indexOf(value) === index), [rule], `#${id} reports only ${rule}`);
  assert.deepEqual(Object.keys(RULES).filter(rule => !Object.values(expected).includes(rule)), [], 'every rule has a tell on this page');
  assert.equal(rulesFor(report, 'vocab').length, 2, 'click on and radio button are separate findings');
  for (const found of report.violations) { assert.ok(RULES[found.rule], `${found.rule} is a documented rule`); assert.equal(found.severity, 'warn'); }
});
test('correct forms, hidden menus, user content, other languages and the page outside the scope are left alone', async () => {
  const report = await fixture.lint(lintPage, '/tells');
  for (const id of ['sc-good', 'hidden-item', 'user-item', 'must', 'german', 'fixed', 'outside']) assert.deepEqual(rulesFor(report, id), [], `#${id} is not reported`);
  assert.deepEqual((await fixture.lint(lintPage, '/german')).violations, [], 'a German page is not judged by English rules');
});
test('findings warn by default, fail under strict, and can be skipped or ignored', async () => {
  const report = await fixture.lint(lintPage, '/tells');
  assert.equal(report.status, 'warnings');
  assert.deepEqual(report.ignored, [{ element: '#allowed', rule: 'button-title-caps' }]);
  assert.equal((await fixture.lint(lintPage, '/tells', { strict: true })).status, 'failed');
  const skipped = await fixture.lint(lintPage, '/tells', { skip: ['ellipsis-character'] });
  assert.ok(!skipped.violations.some(found => found.rule === 'ellipsis-character'));
  assert.deepEqual(skipped.skipped, ['ellipsis-character']);
  await assert.rejects(fixture.lint(lintPage, '/tells', { skip: ['no-such-rule'] }), /Unknown wording lint rule/);
  assert.deepEqual(Object.keys(SEVERITY), Object.keys(RULES));
  assert.match(summarize(report), /Wording lint warnings: \d+ finding\(s\)/);
});
test('the command exits 0 on warnings, 1 under --strict and 2 without a URL', async () => {
  const quiet = { write() {}, fail() {} };
  assert.equal(await main([fixture.base + '/tells'], quiet), 0);
  assert.equal(await main([fixture.base + '/tells', '--strict'], quiet), 1);
  assert.equal(await main([fixture.base + '/clean', '--strict', '--json'], quiet), 0);
  assert.equal(await main([], quiet), 2);
  assert.equal(await main(['file:///etc/passwd'], quiet), 2);
  const report = await runWordingLint({ url: fixture.base + '/clean' });
  assert.equal(report.url, fixture.base + '/clean');
});
test('every rule says where it comes from, and omitted rules do not exist', () => {
  for (const [rule, advice] of Object.entries(RULES)) assert.match(advice, /Manual of Style, 1995|Windows Interface Guidelines, final 1995/, `${rule} names its source`);
  for (const [rule, advice] of Object.entries(RULES)) assert.match(advice, /stated|inferred|convention/i, `${rule} says whether it is stated or inferred`);
  for (const rule of Object.keys(OMITTED)) assert.equal(RULES[rule], undefined, `${rule} is documented as omitted`);
  for (const entry of VOCABULARY) assert.doesNotThrow(() => new RegExp(entry.match, 'iu'));
});

const wrong = (label, ...words) => assert.deepEqual(titleCaps(label).problems?.map(found => found.word), words, label);
const right = label => assert.deepEqual(titleCaps(label).problems, [], label);
const skipped = label => assert.ok(titleCaps(label).skipped, `${label} is not judged`);
test('title caps: ordinary words are capitalized, first and last word always', () => {
  for (const label of ['Save', 'Save As', 'Status Bar', 'Full Screen', 'Undo Typing', 'New Query', 'Go To', 'Send To', 'Protect Document']) right(label);
  wrong('Save as', 'as'); wrong('save', 'save'); wrong('New document', 'document'); wrong('the Works', 'the'); wrong('Send to', 'to'); wrong('Rename document', 'document');
  assert.deepEqual(titleCaps('Find next').problems, [{ word: 'next', expected: 'Next' }]);
});
test('title caps: articles, conjunctions and short prepositions stay lower case inside a label', () => {
  for (const label of ['Move or Copy Sheet', 'Save and Close', 'Print to File', 'Go to Page', 'Tip of the Day']) right(label);
  wrong('Save And Close', 'And'); wrong('Move Or Copy Sheet', 'Or'); wrong('Tip Of The Day', 'Of', 'The');
  assert.deepEqual(titleCaps('Save And Close').problems, [{ word: 'And', expected: 'and' }]);
});
test('title caps: words that may be adverbs are accepted in either case inside a label', () => {
  for (const label of ['Keep Help on Top', 'Keep Help On Top', 'Log On to Network', 'Zoom In', 'Move Up', 'Back Up Now', 'Turn Off Computer', 'Set Up Printer']) right(label);
  wrong('Zoom in', 'in'); wrong('up One Level', 'up');
});
test('title caps: acronyms, names with their own casing, numbers and file names are accepted as written', () => {
  for (const label of ['OK', 'ASCII Text', 'Open in WordPad', 'MS-DOS Prompt', 'ToolTip Options', 'Windows 95 Setup', '3D Effects', 'Open readme.txt', 'Open C:\\AUTOEXEC.BAT', 'Import/Export Setup', 'Read-only Files', 'Send to user@example.com Now', 'Rename "my letter" Now', 'About Vector95']) right(label);
  wrong('Import/export Setup', 'export'); wrong('Open in wordpad', 'wordpad');
});
test('title caps: decoration is stripped, and user data and sentences are not judged', () => {
  for (const label of ['Options...', 'Options…', 'Profiles >>', 'File Name:', 'Save (unavailable)', 'Document1 - Properties for letter']) right(label);
  wrong('Save as...', 'as'); wrong('Review options…', 'options'); wrong('Delete (locked) file', 'file');
  for (const label of ['100%', '(No recent files)', '1 letter to anna.txt', '2 C:\\docs\\b.txt', '...', '>>', 'Do you want to save changes?', 'Replace the file, then close it', 'This deliberately long label carries more than eight words in all']) skipped(label);
});
test('title caps: a label set entirely in capitals is reported once', () => {
  assert.deepEqual(titleCaps('SAVE AS').problems, [{ word: 'SAVE AS', expected: 'title caps, not all capitals' }]);
  right('FTP URL'); right('ASCII');
});
test('shortcut text: the period form passes and each other form says what is wrong', () => {
  for (const text of ['', 'Ctrl+S', 'Ctrl+Shift+N', 'Alt+F4', 'Shift+F12', 'F5', 'Del', 'Ctrl+Del', 'Alt+Enter', 'Ctrl+PgUp', 'Alt+Print Screen', 'Ctrl+Num 5', 'Ctrl++', 'Ctrl+1', 'Ctrl+]', 'Alt+Backspace']) assert.equal(shortcutProblem(text), '', text);
  const cases = { 'CTRL+S': /"CTRL" should be "Ctrl"/, 'ctrl+S': /should be "Ctrl"/, 'Control+S': /should be "Ctrl"/, 'Ctrl + S': /spaces/, 'Ctrl-S': /plus sign/, 'Ctrl S': /plus sign/, '⌘S': /glyph/, '^S': /glyph/, 'Cmd+S': /not a Windows 95 modifier/, 'Win+E': /not a Windows 95 modifier/, 'Ctrl+s': /should be "S"/, 'Ctrl+': /no key/, 'f5': /should be "F5"/, 'Ctrl+DELETE': /initial capital/, 'Ctrl+enter': /initial capital/ };
  for (const [text, reason] of Object.entries(cases)) assert.match(shortcutProblem(text), reason, text);
});
