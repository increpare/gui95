import { readFileSync } from 'node:fs';

// The period evidence register: one record per rule about how Windows 95 looked or behaved.
// Curated, versioned data only: no network request or consumer filesystem access.
const register = JSON.parse(readFileSync(new URL('./register.json', import.meta.url), 'utf8'));
const records = register.records;
const byId = new Map(records.map((record) => [record.id, record]));
const order = new Map(records.map((record, index) => [record.id, index]));

export const ERAS = Object.freeze({
  'win95-1995': 'Windows 95, original 1995 release and the final 1995 guidelines',
  'win95-draft': 'February 1995 draft only: the final 1995 book changed it',
  'win3x': 'Windows 3.x',
  'win98-ie4': 'Windows 98 or Windows 95 with Internet Explorer 4',
  'later': 'Later than Windows 98'
});
export const KIT_STATUSES = Object.freeze({
  'matches': 'matches',
  'differs-unintended': 'differs (unintended)',
  'differs-deliberate': 'differs (deliberate)',
  'not-implemented': 'not implemented',
  'not-applicable': 'not applicable',
  'unknown': 'unknown'
});
export const CONFIDENCE_LEVELS = Object.freeze(['high', 'medium', 'low']);
export const EVIDENCE_TYPES = Object.freeze({
  stated: 'stated in the text',
  figure: 'read from a figure',
  structural: 'structural, from source code',
  inferred: 'inferred',
  measured: 'measured'
});
export const SOURCE_KINDS = Object.freeze({
  'final-guidelines': 'The Windows Interface Guidelines for Software Design, Microsoft Press, 1995 (final text, MSDN HTML edition; printed pages from a scan)',
  'draft-guidelines': 'The Windows Interface Guidelines, February 1995 preliminary draft (PDF viewer pages)',
  'manual-of-style': 'The Microsoft Manual of Style for Technical Publications, 1st edition, Microsoft Press, 1995 (PDF pages; printed folio is eight less)',
  'howlett': 'Virginia Howlett, Visual Interface Design for Windows, Wiley, 1996 (PDF pages; printed page is twelve less)',
  'wine-source': 'Wine source code, a reimplementation of Windows (master as retrieved on 2026-11-18; LGPL)',
  'reactos-source': 'ReactOS source code, a reimplementation of Windows (master as retrieved on 2026-11-18; GPL)',
  'file-manager-templates': 'Microsoft File Manager dialog templates, published by Microsoft (Windows 3.1 resources)',
  'measured': 'Measured by rendering',
  'win95-capture': 'Measured on real Windows 95 4.00.1111 C (OSR2.5; user and gdi files 4.0.0.950, comctl32 4.70) in an emulator with tools/win95-reference, 19 November 2026',
  'win95-recording': 'Behaviour recorded step by step on real Windows 95 4.00.1111 C (OSR2.5; user files 4.0.0.950, comctl32 4.70) in an emulator with tools/win95-reference: keys and mouse through the emulator, state read back from the system after each step, 19 November 2026'
});
export const VISIBILITY = Object.freeze(['obvious', 'visible', 'subtle', 'invisible']);
export const CAVEAT = 'This register records what written sources and reimplementations say and what the GUI95 kit does. It is not a certification of fidelity. Most records have not been compared with a real Windows 95 system; those that have carry a source of kind win95-capture (pixels and sizes) or win95-recording (behaviour), measured on Windows 95 4.00.1111 C (OSR2.5, 1996), not on the 1995 original. Quote each rule with its era and confidence.';

const copy = (value) => structuredClone(value);
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

function boundedText(value, label, max) {
  if (value === undefined) return '';
  if (typeof value !== 'string' || value.length > max) throw new TypeError(`${label} must be a string of at most ${max} characters.`);
  return value.trim();
}

function oneOf(value, label, allowed) {
  const text = boundedText(value, label, 40);
  if (text && !allowed.includes(text)) throw new TypeError(`${label} must be one of: ${allowed.join(', ')}.`);
  return text;
}

/** Whether a rule may be repeated as Windows 95 behaviour, decided from era and confidence alone. */
function standing(record) {
  const { era, confidence } = record;
  const base = { era, era_label: ERAS[era], confidence: confidence.level, confidence_reason: confidence.reason };
  if (era === 'win95-draft') return { ...base, may_state_as_windows_95: 'no', cite_as: `Not the Windows 95 rule: a February 1995 draft statement that the final 1995 book changed${record.superseded_by ? ` (see ${record.superseded_by})` : ''}.` };
  if (era !== 'win95-1995') return { ...base, may_state_as_windows_95: 'no', cite_as: `Not Windows 95: ${ERAS[era]}.` };
  if (confidence.level === 'low') return { ...base, may_state_as_windows_95: 'no', cite_as: 'Unsettled: low confidence. Do not state this as Windows 95 behaviour; say what each source reports.' };
  const captured = record.sources.some((source) => source.kind === 'win95-capture' || source.kind === 'win95-recording');
  const compared = captured ? 'measured on Windows 95 4.00.1111 C (OSR2.5, 1996), not on the 1995 original' : 'not yet compared with a real system';
  if (confidence.level === 'medium') return { ...base, may_state_as_windows_95: 'with-caveat', cite_as: `Probably Windows 95 (1995): medium confidence. Name the source when repeating it; ${compared}.` };
  return { ...base, may_state_as_windows_95: 'yes', cite_as: `Windows 95 (1995): high confidence from the sources cited; ${compared}.` };
}

/** Era and confidence come first in every returned record so they cannot be dropped by reading only the rule. */
function present(record) {
  const { id, title, rule, topic, control, evidence_type, sources, verification, kit, visibility, supersedes, superseded_by, notes } = record;
  return copy({
    id, title, standing: standing(record), rule, topic, control,
    evidence_type, evidence_type_label: EVIDENCE_TYPES[evidence_type],
    sources: sources.map((source) => ({ ...source, kind_label: SOURCE_KINDS[source.kind] })),
    verification,
    kit: { ...kit, status_label: KIT_STATUSES[kit.status] },
    ...(visibility ? { visibility } : {}),
    ...(supersedes ? { supersedes } : {}),
    ...(superseded_by ? { superseded_by } : {}),
    notes
  });
}

function rank(items, query) {
  const terms = [...new Set(query.toLowerCase().normalize('NFKC').match(/[\p{L}\p{N}]+/gu) ?? [])];
  if (!terms.length) return items;
  return items.map((item) => {
    const text = JSON.stringify(item).toLowerCase().normalize('NFKC');
    const head = `${item.id} ${item.title} ${item.control}`.toLowerCase();
    return { item, matches: terms.every((term) => text.includes(term)), score: terms.reduce((sum, term) => sum + (head.includes(term) ? 2 : 1), 0) };
  }).filter((entry) => entry.matches).sort((a, b) => b.score - a.score || order.get(a.item.id) - order.get(b.item.id)).map((entry) => entry.item);
}

/**
 * Search the register by free text, control, topic, era, kit status and confidence.
 * Every result carries `standing` (era, confidence and how it may be cited) ahead of the rule itself.
 */
export function findRules(value = {}) {
  if (!isRecord(value)) throw new TypeError('Options must be an object.');
  const query = boundedText(value.query, 'query', 200);
  const limit = value.limit === undefined ? 20 : value.limit;
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new TypeError('limit must be an integer from 1 through 20.');
  const topic = boundedText(value.topic, 'topic', 64);
  const control = boundedText(value.control, 'control', 64);
  const era = oneOf(value.era, 'era', Object.keys(ERAS));
  const status = oneOf(value.kit_status, 'kit_status', Object.keys(KIT_STATUSES));
  const confidence = oneOf(value.confidence, 'confidence', CONFIDENCE_LEVELS);
  const matched = rank(records.filter((record) => (!topic || record.topic === topic) && (!control || record.control === control) &&
    (!era || record.era === era) && (!status || record.kit.status === status) && (!confidence || record.confidence.level === confidence)), query);
  return { schema_version: 1, compiled: register.compiled, kit_version_checked: register.kit_version_checked, caveat: CAVEAT, total: matched.length, items: matched.slice(0, limit).map(present) };
}

/** Unknown IDs return null; returned records cannot mutate the shared register. */
export function getRule(id) {
  const record = byId.get(boundedText(id, 'id', 100));
  return record ? present(record) : null;
}

const tally = (key, keys) => {
  const counts = Object.fromEntries((keys ?? []).map((name) => [name, 0]));
  for (const record of records) counts[key(record)] = (counts[key(record)] ?? 0) + 1;
  return counts;
};

/** Counts, the topic and control vocabularies, and the unintended differences ordered by how visible they are. */
export function summarizeRegister() {
  const unintended = records.filter((record) => record.kit.status === 'differs-unintended')
    .sort((a, b) => VISIBILITY.indexOf(a.visibility) - VISIBILITY.indexOf(b.visibility) ||
      CONFIDENCE_LEVELS.indexOf(a.confidence.level) - CONFIDENCE_LEVELS.indexOf(b.confidence.level) || order.get(a.id) - order.get(b.id));
  return copy({
    schema_version: 1, compiled: register.compiled, kit_version_checked: register.kit_version_checked, caveat: CAVEAT, total: records.length,
    by_kit_status: tally((record) => record.kit.status, Object.keys(KIT_STATUSES)),
    by_confidence: tally((record) => record.confidence.level, CONFIDENCE_LEVELS),
    by_era: tally((record) => record.era, Object.keys(ERAS)),
    by_topic: tally((record) => record.topic),
    topics: [...new Set(records.map((record) => record.topic))],
    controls: [...new Set(records.map((record) => record.control))].sort(),
    sources: { total: records.reduce((sum, record) => sum + record.sources.length, 0), checked: records.reduce((sum, record) => sum + record.sources.filter((source) => source.checked).length, 0) },
    unintended_differences: unintended.map((record) => ({ id: record.id, title: record.title, visibility: record.visibility, confidence: record.confidence.level, control: record.control, detail: record.kit.detail })),
    open_questions: records.filter((record) => record.kit.status === 'unknown').map((record) => ({ id: record.id, title: record.title, confidence: record.confidence.level }))
  });
}

/** The raw records, detached, for the document generator and the tests. */
export function allRules() {
  return copy(records);
}
