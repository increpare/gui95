/** Shared fixture server for the wording and layout lint tests: small pages by path, the kit's own files, and the widget examples. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const kitRoot = fileURLToPath(new URL('../', import.meta.url));
export const widgetRoot = fileURLToPath(new URL('../../demo/dist/widgets/', import.meta.url));
export const html = body => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Lint fixture</title><style>body{margin:0}.gui95{background:#c0c0c0;color:#000;font:11px Tahoma,Arial,sans-serif;padding:8px}.gui95 :is(button,input,select,textarea){font:inherit;box-sizing:border-box;margin:0;border:0}.gui95 button{width:75px;height:23px;padding:0}.gui95 input:not([type=checkbox],[type=radio]){height:23px;padding:4px;width:120px}.gui95 dialog{position:static;margin:8px 0;padding:0;border:0;width:300px;color:inherit;background:#c0c0c0}.title-bar{background:#000080;color:#fff;padding:3px}.body{padding:12px}.actions{display:flex;gap:6px;justify-content:flex-end;margin-top:12px}.window{margin:8px 0;padding:12px}</style></head><body>${body}</body></html>`;
export async function startFixture(pages) {
  const server = createServer(async (req, res) => {
    const path = req.url.split('?')[0];
    if (pages.has(path)) { res.setHeader('content-type', 'text/html'); res.end(pages.get(path)); return; }
    const widget = /^\/widgets\/([a-z0-9-]+\.html)$/.exec(path);
    if (!widget && (!/^\/components\/[a-zA-Z0-9./-]+$/.test(path) || path.includes('..'))) { res.writeHead(404).end(); return; }
    try { res.setHeader('content-type', path.endsWith('.mjs') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : 'text/html'); res.end(await readFile(widget ? widgetRoot + widget[1] : kitRoot + path)); } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const open = async path => { const page = await browser.newPage({ viewport: { width: 900, height: 700 } }); await page.goto(base + path); return page; };
  const lint = async (lintPage, path, options) => { const page = await open(path); try { return await lintPage(page, options); } finally { await page.close(); } };
  const close = async () => { await browser.close(); await new Promise(resolve => server.close(resolve)); };
  return { base, open, lint, close };
}
export const rulesFor = (report, id) => report.violations.filter(item => item.element === '#' + id).map(item => item.rule);
