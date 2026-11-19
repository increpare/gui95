// In a dialog the default look follows the focus among push buttons. Measured on Windows 95: the dialog manager gives
// whichever push button has the focus the default style and takes it from the designated default button, and gives it
// back when the focus goes to anything that is not a push button (tools/win95-reference/recordings/dialog-tab-order.json).
// Only computed styles are read, so nothing here depends on the host's fonts.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const css = await readFile(new URL('../components/gui95.css', import.meta.url), 'utf8');
const fixture = `<!doctype html><html><head><link rel="stylesheet" href="/gui95.css"></head><body class="gui95" style="margin:0;padding:20px">
<section class="window" style="width:360px"><div class="title-bar">Dialog<button id="close" aria-label="Close">x</button></div><form data-gui95-dialog-layout>
<div data-gui95-dialog-body><input id="name" value="Untitled"><label><input type="checkbox" id="box"> Read only</label><button type="button" id="latch" aria-pressed="false">Bold</button></div>
<div data-gui95-buttons><button type="button" class="default" id="ok">OK</button><button type="button" id="cancel">Cancel</button><button type="button" id="off" disabled>Apply</button></div></form></section>
<p><button type="button" class="default" id="loose-default">Create</button><button type="button" id="loose">Reset</button></p>
</body></html>`;

let server, browser, page;
before(async () => {
  server = createServer((req, res) => { if (req.url === '/gui95.css') { res.setHeader('content-type', 'text/css'); res.end(css); } else { res.setHeader('content-type', 'text/html'); res.end(fixture); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch(); page = await browser.newPage({ viewport: { width: 600, height: 400 } }); await page.goto(`http://127.0.0.1:${server.address().port}/`);
});
after(async () => { await browser?.close(); await new Promise(resolve => server?.close(resolve)); });

const shadow = id => page.evaluate(id => getComputedStyle(document.getElementById(id)).boxShadow, id);
const focus = id => page.evaluate(id => document.getElementById(id).focus(), id);
// The default look starts with the one-pixel black frame; the plain raised button does not.
const looksDefault = async id => (await shadow(id)).startsWith('rgb(0, 0, 0) 0px 0px 0px 1px inset');

test('with the focus in a field, the designated default button has the default look', async () => {
  await focus('name');
  assert.equal(await looksDefault('ok'), true); assert.equal(await looksDefault('cancel'), false);
  await focus('box');
  assert.equal(await looksDefault('ok'), true, 'a check box is not a push button: the default stays where it was');
});

test('the default look moves to the push button that has the focus, and back when focus leaves the buttons', async () => {
  await focus('name'); const plain = await shadow('cancel'), marked = await shadow('ok');
  await focus('cancel');
  assert.equal(await shadow('cancel'), marked, 'the focused push button is drawn as the default');
  assert.equal(await shadow('ok'), plain, 'and the designated default button is drawn plain meanwhile');
  await focus('ok');
  assert.equal(await shadow('ok'), marked); assert.equal(await shadow('cancel'), plain);
  await focus('name');
  assert.equal(await shadow('ok'), marked); assert.equal(await shadow('cancel'), plain);
});

test('a latching button and a title bar button do not take the default look, and nothing changes size', async () => {
  await focus('name'); const size = id => page.evaluate(id => { const r = document.getElementById(id).getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }, id), before = [await size('ok'), await size('cancel')];
  await focus('latch');
  assert.equal(await looksDefault('latch'), false); assert.equal(await looksDefault('ok'), true);
  await focus('close');
  assert.equal(await looksDefault('close'), false); assert.equal(await looksDefault('ok'), true);
  await focus('cancel');
  assert.deepEqual([await size('ok'), await size('cancel')], before, 'the look is drawn inside the button: no rectangle moves');
});

test('outside a dialog the rule does not apply', async () => {
  await focus('loose');
  assert.equal(await looksDefault('loose'), false); assert.equal(await looksDefault('loose-default'), true);
});
