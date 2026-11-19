#!/usr/bin/env node
// Builds the example audit: examples/widgets/audit.json (one record per example) and docs/example-audit.md.
//
//   node tools/build-example-audit.mjs           write both
//   node tools/build-example-audit.mjs --check   exit 1 if either is out of date, or if a difference has no decision
//
// Inputs, both committed:
//   tools/example-audit/results.json     what tools/example-audit/run.mjs compared and what differed (needs a browser and the captures)
//   tools/example-audit/decisions.json   the judgement: each difference with its severity and status, the lint triage, what was not checked
// This script needs neither a browser nor the captures, so --check runs in the ordinary tests. It refuses to build
// while any disagreeing step, pair, layout number, check or lint finding in the results is not named by a decision,
// so a difference cannot drop out of the record by being forgotten.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const file = name => path.join(root, name);
const json = async name => JSON.parse(await readFile(file(name), 'utf8'));
const STATUSES = ['fixed', 'open', 'deliberate', 'host limit'], SEVERITIES = ['high', 'medium', 'low'], TRIAGE = ['real', 'false positive', 'deliberate'];
const VERDICTS = { verified: 'Verified', open: 'Verified, with open differences', partial: 'Partly checked', none: 'Not verifiable' };

/** The era of a piece of evidence, from the library that drew or drove it. */
export function eraOf(drawnBy = '') {
  const eras = [];
  if (/user32|gdi32|refgrid/.test(drawnBy)) eras.push('user32/gdi32 4.0.0.950: the window manager of the 1995 release (on an OSR2.5 system)');
  if (/comctl32/.test(drawnBy)) eras.push('comctl32 4.70: the 1996 common controls, not the 1995 library');
  if (/comdlg32|shell32/.test(drawnBy)) eras.push('comdlg32 4.0.0.951 and shell32 4.0.0.1111: OSR2\'s common dialogs');
  return eras;
}

const glob = (pattern, value) => pattern === value || (pattern.endsWith('*') && value.startsWith(pattern.slice(0, -1)));

/** Everything in one example's results that disagrees, as { kind, key, text } items a decision must cover. */
export function disagreements(result) {
  const items = [];
  for (const pair of result.visual.pairs) {
    if (typeof pair.result === 'string') { items.push({ kind: 'pairs', key: pair.name, text: pair.result }); continue; }
    const r = pair.result;
    if (r.pixels === 'layout only' || /not compared/.test(r.pixels)) continue;
    // Equal edges at another size, or an equal frame around different text, is not a disagreement by itself: sizes that matter are layout numbers.
    if (r.pixels === 'frame-differs' || r.pixels === 'edges-differ') items.push({ kind: 'pairs', key: pair.name, text: `${r.real.w} by ${r.real.h} against ${r.example.w} by ${r.example.h}: ${r.pixels}` });
  }
  for (const m of result.visual.metrics) if (!m.same) items.push({ kind: 'metrics', key: m.name, text: m.result ?? `real ${m.real}, example ${m.example}` });
  for (const b of result.behaviour) {
    if (b.error) { items.push({ kind: 'steps', key: `${b.name}#error`, text: b.error }); continue; }
    for (const s of b.steps) if (!s.agree) items.push({ kind: 'steps', key: `${b.name}#${s.index}`, text: s.differences.map(d => `${d.where}: real ${JSON.stringify(d.real)}, example ${JSON.stringify(d.example)}`).join('; ') });
  }
  for (const c of result.checks ?? []) if (!c.agree) items.push({ kind: 'checks', key: c.what, text: c.error ?? `real ${JSON.stringify(c.real)}, example ${JSON.stringify(c.example)}` });
  return items;
}

const describeStep = step => {
  const action = step.key !== undefined ? `press ${[].concat(step.key).join('+')}` : step.text !== undefined ? `type "${step.text}"` : step.down !== undefined ? `hold ${step.down}` : step.up !== undefined ? `release ${step.up}` : step.wait !== undefined ? `wait ${step.wait} ms`
    : step.press ? `${step.press} button down` : step.release ? `${step.release} button up` : step.click !== undefined ? 'click' : step.rightclick !== undefined ? 'right-click' : step.dblclick !== undefined ? 'double-click' : step.move !== undefined ? 'move the pointer' : 'step';
  return step.note ? `${action} (${step.note})` : action;
};

/** One example's audit record from its results and its decisions. Throws when a disagreement has no decision. */
export function buildRecord(example, result, decision, shared) {
  const problems = [];
  if (!decision) throw new Error(`${example.id}: no entry in decisions.json.`);
  const differences = (decision.differences ?? []).map(d => {
    const base = d.use ? shared.differences?.[d.use] : null;
    if (d.use && !base) problems.push(`difference uses unknown shared entry "${d.use}"`);
    const merged = { ...base, ...d }; delete merged.use;
    if (!SEVERITIES.includes(merged.severity)) problems.push(`difference "${merged.id}" has severity "${merged.severity}"`);
    if (!STATUSES.includes(merged.status)) problems.push(`difference "${merged.id}" has status "${merged.status}"`);
    for (const field of ['id', 'kind', 'summary']) if (!merged[field]) problems.push(`a difference lacks "${field}"`);
    return merged;
  });
  const items = result ? disagreements(result) : [];
  const covered = item => differences.some(d => (d.covers?.[item.kind] ?? []).some(pattern => glob(pattern, item.key)));
  for (const item of items) if (!covered(item)) problems.push(`no decision covers ${item.kind} "${item.key}" (${item.text})`);
  for (const d of differences) for (const [kind, patterns] of Object.entries(d.covers ?? {})) for (const pattern of patterns) if (result && !items.some(item => item.kind === kind && glob(pattern, item.key)) && d.status !== 'fixed') problems.push(`difference "${d.id}" covers ${kind} "${pattern}", which is not a disagreement in the results`);

  const lint = { wording: [], layout: [] };
  for (const kind of ['wording', 'layout']) for (const finding of result?.lint?.[kind] ?? []) {
    const key = `${finding.rule}|${finding.value}`, own = decision.lint?.[key] ?? Object.entries(decision.lint ?? {}).find(([pattern]) => glob(pattern, key))?.[1], general = shared.lintRules?.[finding.rule];
    const triage = own ?? general;
    if (!triage) { problems.push(`lint finding not triaged: ${key}`); continue; }
    if (!TRIAGE.includes(triage.triage)) problems.push(`lint triage "${triage.triage}" for ${key}`);
    lint[kind].push({ rule: finding.rule, finding: finding.value, where: finding.state, triage: triage.triage, ...(triage.status ? { status: triage.status } : {}), note: triage.note ?? '' });
  }
  if (problems.length) throw new Error(`${example.id}: ${problems.join('; ')}`);

  const pairs = result?.visual.pairs ?? [], pixelPairs = pairs.filter(p => typeof p.result === 'object' && !['layout only'].includes(p.result.pixels) && !/not compared/.test(p.result.pixels));
  const behaviours = (result?.behaviour ?? []).filter(b => !b.error), comparedSteps = behaviours.reduce((n, b) => n + b.compared, 0), checks = (result?.checks ?? []).filter(c => !c.error && c.real !== null && c.example !== null);
  const drawn = [...new Set([...pairs.map(p => p.drawnBy), ...behaviours.map(b => b.drawnBy)].filter(Boolean))];
  const hasRendering = pixelPairs.length > 0, hasBehaviour = comparedSteps + checks.length > 0, open = differences.filter(d => d.status === 'open');
  let verdict = !hasRendering && !hasBehaviour ? 'none' : !hasRendering || !hasBehaviour ? 'partial' : open.length ? 'open' : 'verified';
  if (decision.verdict) { if (!VERDICTS[decision.verdict]) throw new Error(`${example.id}: unknown verdict "${decision.verdict}".`); const rank = ['verified', 'open', 'partial', 'none']; if (rank.indexOf(decision.verdict) < rank.indexOf(verdict)) throw new Error(`${example.id}: the verdict "${decision.verdict}" claims more than was compared (${verdict}).`); verdict = decision.verdict; }

  return {
    id: example.id, title: example.title, family: example.family, page: `demo/dist/widgets/${example.id}.html`,
    families: decision.families ?? [],
    counterpart: { real: decision.counterpart ?? null, captures: [...new Set(pairs.map(p => p.real?.capture ?? (p.real?.grid ? 'refgrid capture' : null)).filter(Boolean))], recordings: [...new Set(behaviours.map(b => b.script))], era: [...new Set(drawn.flatMap(eraOf))] },
    verdict, verdictText: VERDICTS[verdict] + (verdict === 'verified' && differences.some(d => d.status === 'host limit') ? ', apart from host limits' : ''), ...(decision.verdictNote ? { verdictNote: decision.verdictNote } : {}),
    rendering: {
      method: hasRendering || pairs.length ? 'The example at the period density in Chromium (1280 by 900, scale 1) against the 24-bit screen dump of the real control: sizes; every pixel when the sizes are equal, with the outer frame counted apart from the inside (text and glyphs); the lines met walking in from each side when they are not. Layout numbers are differences between measured rectangles on both sides.' : 'Not compared.',
      pairs: pairs.map(p => typeof p.result === 'string' ? { name: p.name, result: p.result } : { name: p.name, real: `${p.result.real.w} by ${p.result.real.h}`, example: `${p.result.example.w} by ${p.result.example.h}`, result: p.result.pixels, ...(p.result.differingPixels ? { differingPixels: p.result.differingPixels, ofWhichInTheFrame: p.result.framePixels } : {}), ...(p.result.edges && p.result.edges !== 'same' ? { edges: p.result.edges } : {}), ...(p.result.ink ? { ink: p.result.ink } : {}), ...(p.result.runs ? { runs: p.result.runs } : {}), ...(p.note ? { note: p.note } : {}) }),
      layout: (result?.visual.metrics ?? []).map(m => ({ name: m.name, ...(m.result ? { result: m.result } : { real: m.real, example: m.example, same: m.same }) }))
    },
    behaviour: {
      method: hasBehaviour ? 'Steps recorded on the real system (keys and mouse through the emulator, state read back from Windows after each) replayed against the example in Chromium with Playwright; after each step the same facts are read from the page and compared. Where it says so, the example is first put into the state the real system was in before the step, so each step is compared on its own.' : 'Not compared.',
      replays: (result?.behaviour ?? []).map(b => b.error ? { name: b.name, recording: b.script, error: b.error } : { name: b.name, recording: b.script, compared: b.compared, agreed: b.agreed, differing: b.steps.filter(s => !s.agree).map(s => ({ step: s.index, did: describeStep(s.step), differences: s.differences })), notCompared: b.skipped.filter(s => !/setup of the real scene/.test(s.why)).map(s => ({ step: s.index, did: describeStep(s.step), why: s.why })) }),
      checks: (result?.checks ?? []).map(c => c.error ? { what: c.what, error: c.error } : { what: c.what, real: c.real, example: c.example, agree: c.agree, ...(c.note ? { note: c.note } : {}) })
    },
    differences, lint,
    notChecked: decision.notChecked ?? []
  };
}

const cell = text => String(text ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const count = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

export function renderMarkdown(audit) {
  const lines = [], out = text => lines.push(text);
  const records = audit.examples, by = verdict => records.filter(r => r.verdict === verdict);
  out('# Example audit: the 38 widget examples against real Windows 95');
  out('');
  out('<!-- Generated by tools/build-example-audit.mjs from tools/example-audit/results.json and decisions.json. Do not edit; run the script. -->');
  out('');
  out(`Each of the ${records.length} examples in \`demo/dist/widgets/\` was compared with ${audit.real.guest} running in an emulator: its rendering at the period density with a screen dump of the real control or window, and its behaviour with a step-by-step recording of the real system. This page says, per example, exactly what was compared, how, and what differs. The machine-readable form is [examples/widgets/audit.json](../examples/widgets/audit.json).`);
  out('');
  out('**Read the verdict literally.** "Verified" means both the rendering and a recorded behaviour script were compared with real captures and recordings, and no difference is left open. "Partly checked" means one of the two was not compared. "Not verifiable" means there was nothing real to compare with, or the example hands the job to the browser. A verdict covers what the record lists and nothing else; each record ends with what was not checked.');
  out('');
  out('## What the evidence is');
  out('');
  out(`- **Real system:** ${audit.real.guest}. \`user32.dll\`, \`gdi32.dll\`: ${audit.real.files['user32.dll']} (the version number of the 1995 release). \`comctl32.dll\`: ${audit.real.files['comctl32.dll']} (the 1996 library; evidence for 1996, not 1995). \`comdlg32.dll\`: ${audit.real.comdlg32}; \`shell32.dll\`: ${audit.real.files['shell32.dll']} (OSR2). Each record names the era of its own evidence.`);
  out(`- **Examples:** Chromium ${audit.host.chromium} through Playwright ${audit.host.playwright} on ${audit.host.platform}, ${audit.host.viewport}, \`data-gui95-density="period"\`. Text is drawn by the host's fonts, so widths that follow text are not comparable and are not counted as differences; native controls (text boxes, lists, drop-down lists, sliders) take their keys from the browser and the host, so their differences are recorded as host limits and belong to this host.`);
  out('- **Method:** [win95-reference.md](win95-reference.md) (and `tools/win95-reference/README.md` in the repository) for the captures and recordings; `tools/example-audit/` for the comparison (`specs.mjs` says which element stands for which real control; `run.mjs` runs it; `decisions.json` holds the judgement of every difference).');
  out('- **Statuses:** *fixed* in this audit; *open* (listed for the owner); *deliberate* (the example or the kit differs on purpose, with the reason); *host limit* (the browser or the host decides, not the page).');
  out('');
  out('## Summary');
  out('');
  out(`${count(by('verified').length, 'example')} verified (${by('verified').filter(r => r.differences.some(d => d.status === 'host limit')).length} of them apart from host limits), ${by('open').length} verified with open differences, ${by('partial').length} partly checked, ${by('none').length} not verifiable.`);
  out('');
  out('| Example | Real counterpart | Rendering | Behaviour | Differences | Lint | Verdict |');
  out('| --- | --- | --- | --- | --- | --- | --- |');
  for (const r of records) {
    const pixel = r.rendering.pairs.filter(p => p.result && !/layout only|not compared|no (real|example)/.test(p.result)), same = pixel.filter(p => /^(identical|frame-identical|same-edges)$/.test(p.result)).length;
    const steps = r.behaviour.replays.reduce((n, b) => n + (b.compared ?? 0), 0), agreed = r.behaviour.replays.reduce((n, b) => n + (b.agreed ?? 0), 0), checks = r.behaviour.checks.length;
    const tally = status => r.differences.filter(d => d.status === status).length;
    const lint = [...r.lint.wording, ...r.lint.layout];
    out(`| [${cell(r.title)}](#${r.id}) | ${cell(r.counterpart.real ?? 'none')} | ${pixel.length ? `${same} of ${count(pixel.length, 'pair')} agree in size or edges; ${r.rendering.layout.filter(m => m.same).length} of ${count(r.rendering.layout.length, 'layout number')} equal` : 'not compared'} | ${steps || checks ? [steps ? `${agreed} of ${count(steps, 'step')} agree` : '', checks ? `${r.behaviour.checks.filter(c => c.agree).length} of ${count(checks, 'single check')} agree` : ''].filter(Boolean).join('; ') : 'not compared'} | ${r.differences.length ? ['fixed', 'open', 'deliberate', 'host limit'].filter(s => tally(s)).map(s => `${tally(s)} ${s}`).join(', ') : 'none'} | ${lint.length ? `${lint.filter(l => l.triage === 'real').length} real, ${lint.filter(l => l.triage === 'false positive').length} false, ${lint.filter(l => l.triage === 'deliberate').length} deliberate` : 'clean'} | ${r.verdictText} |`);
  }
  out('');
  const open = records.flatMap(r => r.differences.filter(d => d.status === 'open').map(d => ({ ...d, example: r })));
  out('## Open differences, most visible first');
  out('');
  if (!open.length) out('None.');
  else { out('| Severity | Example | Difference | Real Windows 95 | Example |'); out('| --- | --- | --- | --- | --- |'); for (const severity of SEVERITIES) for (const d of open.filter(d => d.severity === severity)) out(`| ${severity} | [${cell(d.example.title)}](#${d.example.id}) | ${cell(d.summary)} | ${cell(d.real ?? '')} | ${cell(d.example_ ?? d.exampleDoes ?? '')} |`); }
  out('');
  const fixed = records.flatMap(r => r.differences.filter(d => d.status === 'fixed').map(d => ({ ...d, example: r })));
  out('## Fixed in this audit');
  out('');
  if (!fixed.length) out('Nothing.'); else for (const d of fixed) out(`- **${d.example.title}:** ${d.summary}${d.note ? ' ' + d.note : ''}`);
  out('');
  out('## The examples');
  for (const r of records) {
    out('');
    out(`<a id="${r.id}"></a>`);
    out(`### ${r.title}`);
    out('');
    out(`\`${r.page}\` · ${r.family} · **${r.verdictText}**${r.verdictNote ? ` (${r.verdictNote})` : ''}`);
    out('');
    out(`- **Families:** ${r.families.join(', ') || 'none'}.`);
    out(`- **Real counterpart:** ${r.counterpart.real ?? 'none'}.${r.counterpart.captures.length ? ` Captures: ${r.counterpart.captures.map(c => `\`${c}\``).join(', ')}.` : ''}${r.counterpart.recordings.length ? ` Recordings: ${r.counterpart.recordings.map(c => `\`${c}\``).join(', ')}.` : ''}`);
    if (r.counterpart.era.length) out(`- **Era of the evidence:** ${r.counterpart.era.join('; ')}.`);
    const pixel = r.rendering.pairs.filter(p => p.result && !/layout only/.test(p.result));
    if (r.rendering.pairs.length) {
      out(`- **Rendering compared:** ${pixel.map(p => `${p.name} (${p.real ? `${p.real} against ${p.example}: ` : ''}${p.result.replace('frame-identical', 'frame identical, inside differs').replace('same-edges', 'same edges, different size').replace('edges-differ', 'edges differ').replace('frame-differs', 'frame differs')})`).join('; ') || 'sizes only'}.`);
      if (r.rendering.layout.length) out(`- **Layout numbers (real, example), in pixels:** ${r.rendering.layout.map(m => m.result ? `${m.name}: ${m.result}` : `${m.name}: ${m.real}, ${m.example}${m.same ? '' : ' ≠'}`).join('; ')}.`);
    } else out('- **Rendering compared:** nothing.');
    if (r.behaviour.replays.length || r.behaviour.checks.length) {
      for (const b of r.behaviour.replays) out(`- **Behaviour replayed, ${b.name}** (recording \`${b.recording}\`): ${b.error ? `failed: ${b.error}` : `${b.agreed} of ${count(b.compared, 'step')} agree${b.notCompared.length ? `; ${count(b.notCompared.length, 'step')} not comparable` : ''}.`}`);
      for (const c of r.behaviour.checks) out(`- **Measured:** ${c.what}: ${c.error ? `failed: ${c.error}` : `real ${JSON.stringify(c.real)}, example ${JSON.stringify(c.example)}${c.agree ? ' (agree)' : ''}.`}${c.note ? ' ' + c.note : ''}`);
    } else out('- **Behaviour compared:** nothing.');
    if (r.differences.length) {
      out('');
      out('| Difference | Real Windows 95 | Example | Severity | Status |');
      out('| --- | --- | --- | --- | --- |');
      for (const d of r.differences) out(`| ${cell(d.summary)}${d.note ? ` ${cell(d.note)}` : ''} | ${cell(d.real ?? '')} | ${cell(d.exampleDoes ?? '')} | ${d.severity} | ${d.status} |`);
    } else { out(''); out('No differences recorded.'); }
    const lint = [...r.lint.wording.map(l => ({ ...l, kind: 'wording' })), ...r.lint.layout.map(l => ({ ...l, kind: 'layout' }))];
    if (lint.length) { out(''); out('| Lint finding | Triage | Note |'); out('| --- | --- | --- |'); for (const l of lint) out(`| ${l.kind}, \`${l.rule}\`: ${cell(l.finding)} | ${l.triage}${l.status ? `, ${l.status}` : ''} | ${cell(l.note)} |`); }
    else { out(''); out('Both lints are clean on this page.'); }
    if (r.notChecked.length) { out(''); out('Not checked:'); out(''); for (const n of r.notChecked) out(`- ${n.what}: ${n.why}`); }
  }
  out('');
  return lines.join('\n');
}

export async function build() {
  const results = await json('tools/example-audit/results.json'), decisions = await json('tools/example-audit/decisions.json'), manifest = await json('demo/dist/widgets/manifest.json');
  const examples = manifest.examples.map(example => buildRecord(example, results.examples[example.id], decisions.examples[example.id], decisions.shared ?? {}));
  const audit = { description: 'One record per widget example: what was compared with real Windows 95, how, and what differs. Generated by tools/build-example-audit.mjs; do not edit.', real: results.real, host: results.host, examples };
  return { 'examples/widgets/audit.json': JSON.stringify(audit, null, 1) + '\n', 'docs/example-audit.md': renderMarkdown(audit) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    const outputs = await build(), check = process.argv.includes('--check'); let stale = 0;
    for (const [name, text] of Object.entries(outputs)) {
      if (check) { const current = await readFile(file(name), 'utf8').catch(() => null); if (current !== text) { stale++; process.stderr.write(`${name} is out of date; run node tools/build-example-audit.mjs\n`); } }
      else { await writeFile(file(name), text); process.stdout.write(`wrote ${name}\n`); }
    }
    process.exitCode = stale ? 1 : 0;
  } catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1; }
}
