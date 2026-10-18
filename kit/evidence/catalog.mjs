import { readFileSync } from 'node:fs';

// Curated, versioned data only: no network request or consumer filesystem access.
const evidence = JSON.parse(readFileSync(new URL('./evidence.json', import.meta.url), 'utf8'));
const repairs = JSON.parse(readFileSync(new URL('./repairs.json', import.meta.url), 'utf8'));
const releases = JSON.parse(readFileSync(new URL('./releases.json', import.meta.url), 'utf8'));
const byEvidence = new Map(evidence.map((item) => [item.id, item]));
const byRelease = new Map(releases.map((item) => [item.id, item]));
const copy = (value) => structuredClone(value);
const lexical = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

function boundedText(value, label, max, fallback = '') {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || value.length > max) throw new TypeError(`${label} must be a string of at most ${max} characters.`);
  return value.trim();
}

function options(value) {
  if (!isRecord(value)) throw new TypeError('Options must be an object.');
  const query = boundedText(value.query, 'query', 200);
  const limit = value.limit === undefined ? 20 : value.limit;
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new TypeError('limit must be an integer from 1 through 20.');
  return { query, limit };
}

function rank(items, query) {
  const terms = [...new Set(query.toLowerCase().normalize('NFKC').match(/[\p{L}\p{N}]+/gu) ?? [])];
  return items.map((item) => {
    const text = JSON.stringify(item).toLowerCase().normalize('NFKC');
    const title = `${item.id} ${item.title}`.toLowerCase();
    return { item, matches: terms.every((term) => text.includes(term)), score: terms.reduce((sum, term) => sum + (title.includes(term) ? 2 : 1), 0) };
  }).filter((entry) => entry.matches).sort((a, b) => b.score - a.score || lexical(a.item.id, b.item.id)).map((entry) => entry.item);
}

function page(items, limit) {
  return { schema_version: 1, total: items.length, items: copy(items.slice(0, limit)) };
}

/** Search precise claims, preserving source type and applicability in every result. */
export function listEvidence(value = {}) {
  const { query, limit } = options(value);
  const topic = boundedText(value.topic, 'topic', 64);
  return page(rank(evidence.filter((item) => !topic || item.topic === topic), query), limit);
}

/** Unknown IDs return null; returned records cannot mutate the shared catalog. */
export function getEvidence(id) {
  const key = boundedText(id, 'id', 100);
  return copy(byEvidence.get(key) ?? null);
}

function versionParts(version) {
  if (typeof version !== 'string' || !/^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/.test(version)) return null;
  return version.split('.').map(Number);
}

function compareVersions(a, b) {
  const left = versionParts(a);
  const right = versionParts(b);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] < right[i] ? -1 : 1;
  return 0;
}

function inRange(version, range) {
  return compareVersions(version, range.min) >= 0 && compareVersions(version, range.max_exclusive) < 0;
}

/** Advisory integration repairs, not a list of confirmed defects in every matched version. */
export function findRepairs(value = {}) {
  const { query, limit } = options(value);
  const component = boundedText(value.component, 'component', 64);
  const version = boundedText(value.version, 'version', 32);
  if (version && !versionParts(version)) throw new TypeError('version must be an exact stable version such as 1.0.0.');
  return page(rank(repairs.filter((item) => (!component || item.components.includes(component)) &&
    (!version || inRange(version, item.applicable_versions))), query), limit);
}

const invalidManifest = (message) => ({ schema_version: 1, status: 'invalid_manifest', components: [], errors: [message] });

/** Compare only declared component versions; never infer application or host compatibility. */
export function checkUpdates(manifest) {
  if (!isRecord(manifest) || manifest.schema_version !== 1 || !isRecord(manifest.components)) {
    return invalidManifest('Expected schema_version 1 and a components object.');
  }
  const entries = Object.entries(manifest.components);
  if (entries.length > 50) return invalidManifest('A manifest may declare at most 50 components.');
  if (entries.some(([id]) => !/^[a-z][a-z0-9-]{0,63}$/.test(id))) {
    return invalidManifest('Component IDs must use 1–64 lowercase letters, digits, or hyphens, starting with a letter.');
  }
  const components = entries.sort(([a], [b]) => lexical(a, b)).map(([id, rawVersion]) => {
    const release = byRelease.get(id);
    const installed = typeof rawVersion === 'string' && rawVersion.length <= 32 ? rawVersion : null;
    const base = { id, installed, latest: release?.latest ?? null, status: 'unknown_component', compatibility: 'unsupported', repairs: [], note: 'This component ID is not in the catalog.' };
    if (!release) return base;
    if (!versionParts(installed)) return { ...base, status: 'invalid_version', note: 'Use an exact stable X.Y.Z version; ranges, prereleases, and build metadata are not accepted.' };
    const comparison = compareVersions(installed, release.latest);
    const status = comparison === 0 ? 'current' : comparison < 0 ? 'update_available' : 'newer_than_catalog';
    return { ...base, status,
      compatibility: comparison < 0 && versionParts(installed)[0] < versionParts(release.latest)[0] ? 'unsupported' : 'unverified',
      repairs: repairs.filter((repair) => repair.components.includes(id) && inRange(installed, repair.applicable_versions)).map((repair) => repair.id),
      note: comparison === 0 ? 'Version matches the catalog. Consumer and host compatibility still require validation.' :
        comparison < 0 ? 'A newer catalog version exists. This installed release and its migration are not verified by this catalog.' :
          'Installed version is newer than the catalog. No downgrade or compatibility recommendation is made.' };
  });
  return { schema_version: 1, status: 'ok', components, errors: [] };
}
