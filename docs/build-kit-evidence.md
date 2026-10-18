# Build-kit evidence, repairs, and version checks

The build kit keeps exact supported claims in [the evidence data](../kit/evidence/evidence.json), integration regressions in [the repair data](../kit/evidence/repairs.json), and initial component versions in [the release catalog](../kit/evidence/releases.json). The synchronous API is [catalog.mjs](../kit/evidence/catalog.mjs). It reads those files once at import and performs no network requests or consumer filesystem reads.

## What a citation establishes

Every evidence record carries an ID, topic, title, supported claim, source, applicability, limitations, and local references. A source has `kind`, `title`, `url`, `section`, `edition`, `version`, `pages`, and `checked`. The checked date records source inspection, not successful execution of a component or continued availability of an external site.

The catalog distinguishes these sources:

| Kind | What it supports | What it does not establish |
| --- | --- | --- |
| `historical-primary` | A specific passage in a Microsoft-authored period document | That a preliminary draft matches the final handbook |
| `bibliographic-primary` | Edition and publication identity | Control measurements or behavior absent from that bibliography |
| `modern-accessibility` | W3C APG keyboard and semantic authoring patterns | Windows 95 appearance, normative conformance, or tested assistive-technology support |
| `host-api` | Documented browser or Electron API behavior | A historical Windows standard, a native-host test, or a security audit |
| `local-integration-guidance` | The maintained collection's specific extraction lessons | That preserved source already includes the later fix, or that an archived test passed |

The historical menu citation points to **PDF viewer page 116** of the **February 1995 preliminary draft**. It does not substitute the published book's printed pagination. The [Microsoft reading list](https://learn.microsoft.com/en-us/windows/win32/appuistart/other-resources#reading-list) separately identifies the final 1995 handbook. See [historical sources](historical-sources.md) for the full edition distinction.

The modern keyboard sources are the W3C APG [menu](https://www.w3.org/WAI/ARIA/apg/patterns/menubar/), [dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/), [splitter](https://www.w3.org/WAI/ARIA/apg/patterns/windowsplitter/), [tree](https://www.w3.org/WAI/ARIA/apg/patterns/treeview/), [toolbar](https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/), and [spinbutton](https://www.w3.org/WAI/ARIA/apg/patterns/spinbutton/) patterns. The splitter page explicitly identifies incomplete review/example work; retain that limitation when reusing its guidance.

Local references have `path`, one-based `start_line` and `end_line`, an explanatory `purpose`, and a `sha256` for preserved source. Snapshot hashes identify the bytes in [the manifest](../references/snapshot-manifest.json), which may differ from an upstream commit or branch. A local reference is never justified by assuming `upstream/master` contains those bytes. Authored documentation is mutable: the serving layer must add the actual served URL and current content hash before presenting it as a byte-identifiable citation. Local integration sources therefore have `source.url: null`; their `local_refs` identify the actual source to resolve.

## Searching evidence and repairs

```js
import { listEvidence, getEvidence, findRepairs, checkUpdates } from './kit/evidence/catalog.mjs';

listEvidence({ query: 'keyboard', topic: 'menu', limit: 5 });
getEvidence('menu-pointer-ownership');
findRepairs({ component: 'dialog', version: '1.0.0', query: 'reopen' });
```

Searches return `{ schema_version: 1, total, items }`. `total` counts matches before limiting. Both searches accept a `limit` of 1–20, defaulting to 20. Queries are at most 200 characters, ignore case, and require all word/number terms to occur in the record. A title/ID match ranks above a match only in supporting metadata; ties sort by ID. An empty query lists records. Topic and component IDs are exact and case sensitive; an unknown ID or unmatched query returns no matches. `getEvidence` returns a detached record or `null` for an unknown ID. Mutating a result does not change later results.

Invalid option types, oversized queries, invalid limits, and invalid repair version strings throw a short `TypeError` without echoing the supplied input. Repair versions use exact stable `X.Y.Z` strings; ranges, prereleases, build metadata, and abbreviated versions are not accepted. The allowed numeric parts are 0–999999 without leading zeros. A repair's range uses an inclusive `min` and exclusive `max_exclusive`.

Repairs contain symptoms, cause, minimal fix, affected component IDs, `applicable_versions`, evidence IDs, limitations, and regression cases. Their `scope: "integration-guidance"` means the pattern is relevant when diagnosing that consumer integration. Matching a version range is **not** a declaration of a known defect in every matching release, nor proof that applying the suggested change resolves every symptom.

An `available` regression case names a current-kit test file, exact case name, and execution command. Availability does not record a passing result. A `consumer_required` case has no test file or command: its named scenario requires the consuming application's host or document model. Host privilege boundaries, save revisions, packaging, physical-pixel mapping, and short-window layouts require those consumer checks. Preserved tests under `references/` remain evidence of regression intent and are not reported as newly passing.

## Consumer manifests and version decisions

```json
{
  "schema_version": 1,
  "components": {
    "menu": "1.0.0",
    "dialog": "1.0.0",
    "number-field": "1.0.0"
  }
}
```

Stable control IDs are `menu`, `dialog`, `splitter`, `tree`, `toolbar`, and `number-field`. The separately versioned guidance IDs are `electron-shell`, `save-lifecycle`, `packaging`, and `scaling`. Each starts at **1.0.0**. Guidance IDs identify advice versions; they are not additional executable controls.

`checkUpdates(manifest)` accepts up to 50 component declarations and returns `{ schema_version: 1, status, components, errors }`, with components sorted by ID. A structurally invalid manifest returns `status: "invalid_manifest"`, an empty component list, and bounded errors. A valid structure returns `status: "ok"` even when an individual declaration is unknown or invalid; inspect each entry. Entries contain `id`, `installed`, `latest`, `status`, `compatibility`, matching repair IDs, and a short explanatory `note`.

| Component status | Meaning | Initial compatibility report |
| --- | --- | --- |
| `current` | Exact version equals the latest catalog version | `unverified` for the consumer and host |
| `update_available` | Numerically older than the latest catalog version | `unsupported` across an older major; otherwise `unverified` |
| `newer_than_catalog` | Numerically newer than the catalog | `unverified`; no downgrade is recommended |
| `unknown_component` | ID absent from the release catalog | `unsupported`, with `latest: null` |
| `invalid_version` | Version is not an exact supported stable string | `unsupported` |

Only 1.0.0 is cataloged in this initial edition. An older numeric value is not evidence of a real prior release or a tested migration. The checker compares declarations and does not install, modify, or execute anything. A version match never establishes browser, OS, Electron, accessibility, or application compatibility. The initial data deliberately makes no `verified` compatibility claim.

## Verification

Run `node --test kit/test/evidence.test.mjs` from the repository root to check source fields, local line bounds and preserved hashes, search limits and unknown inputs, repair ranges, executable regression references, and deterministic update decisions. Run the component test commands separately for current component behavior. Neither command runs archived consumer applications or replaces visible checks in their supported desktop hosts. See [provenance](provenance.md) and [integration lessons](integration-lessons.md) for that boundary.
