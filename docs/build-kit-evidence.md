# Build-kit evidence, repairs, and version checks

The build kit keeps exact supported claims in [the evidence data](../kit/evidence/evidence.json), rules about how Windows 95 looked and behaved in [the period evidence register](#the-period-evidence-register), integration regressions in [the repair data](../kit/evidence/repairs.json), and component versions with their per-release changes in [the release catalog](../kit/evidence/releases.json). The synchronous API is [catalog.mjs](../kit/evidence/catalog.mjs). It reads those files once at import and performs no network requests or consumer filesystem reads.

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
findRepairs({ component: 'dialog', version: '1.1.0', query: 'reopen' });
```

Searches return `{ schema_version: 1, total, items }`. `total` counts matches before limiting. Both searches accept a `limit` of 1–20, defaulting to 20. Queries are at most 200 characters, ignore case, and require all word/number terms to occur in the record. A title/ID match ranks above a match only in supporting metadata; ties sort by ID. An empty query lists records. Topic and component IDs are exact and case sensitive; an unknown ID or unmatched query returns no matches. `getEvidence` returns a detached record or `null` for an unknown ID. Mutating a result does not change later results.

Invalid option types, oversized queries, invalid limits, and invalid repair version strings throw a short `TypeError` without echoing the supplied input. Repair versions use exact stable `X.Y.Z` strings; ranges, prereleases, build metadata, and abbreviated versions are not accepted. The allowed numeric parts are 0–999999 without leading zeros. A repair's range uses an inclusive `min` and exclusive `max_exclusive`.

Repairs contain symptoms, cause, minimal fix, affected component IDs, `applicable_versions`, evidence IDs, limitations, and regression cases. Their `scope: "integration-guidance"` means the pattern is relevant when diagnosing that consumer integration. Matching a version range is **not** a declaration of a known defect in every matching release, nor proof that applying the suggested change resolves every symptom.

An `available` regression case names a current-kit test file, exact case name, and execution command. Availability does not record a passing result. A `consumer_required` case has no test file or command: its named scenario requires the consuming application's host or document model. Host privilege boundaries, save revisions, packaging, physical-pixel mapping, and short-window layouts require those consumer checks. Preserved tests under `references/` remain evidence of regression intent and are not reported as newly passing.

## The period evidence register

The fourth data file, [register.json](../kit/evidence/register.json), answers a different question from the citations above: not "what supports this integration decision?" but "what did Windows 95 actually do here, and does the kit do the same?" It has one record per rule and is published for people as the [period evidence register](evidence-register.md). It is a sibling file with its own module, [register.mjs](../kit/evidence/register.mjs), not more rows in `evidence.json`, because its records have a different shape: several sources for one rule, an era, a confidence, and a kit status. An evidence record has one source and local line references and makes no statement about the kit.

Each record has:

| Field | Meaning |
| --- | --- |
| `id`, `title`, `topic`, `control` | A stable kebab-case ID, a one-line title, the group the generated document files it under, and the control or surface (`all` when it is general) |
| `rule` | The rule in one or two plain sentences, paraphrased; at most a short phrase is quoted |
| `era` | `win95-1995` (the original release and the final 1995 guidelines), `win95-draft` (a February 1995 draft statement the final book changed), `win3x`, `win98-ie4` or `later` |
| `confidence` | `level` (`high`, `medium`, `low`) and a one-line `reason` |
| `evidence_type` | `stated`, `figure`, `structural` (from source code), `inferred` or `measured` |
| `sources` | Each with `kind`, a `location` precise enough to check, a public `url` or `null`, and `checked`: the date the compiler read at least one of the cited locations against the source and found it says what the rule states, or `null` |
| `verification` | `commissioning_review` (whether the review that commissioned the research verified the record; `false` throughout for now) and the counts `sources_checked` and `sources_total` |
| `kit` | `status` (`matches`, `differs-unintended`, `differs-deliberate`, `not-implemented`, `not-applicable`, `unknown`), `checked` (the file and selector or function looked at), `method` (`rendered`, `read` or `not-checked`), `date` and a `detail` sentence |
| `visibility` | Only on unintended differences: `obvious`, `visible`, `subtle` or `invisible` |
| `supersedes`, `superseded_by` | Link a final 1995 rule and the draft statement it replaced |
| `notes` | Caveats, such as sources that contradict each other |

Source kinds are `final-guidelines`, `draft-guidelines`, `manual-of-style`, `howlett`, `wine-source`, `reactos-source`, `file-manager-templates` and `measured`. Final-guidelines locations are a section file and title, with the printed page where known, and link to `https://techshelps.github.io/MSDN/WINGUIDE/<section>.htm`. Wine and ReactOS locations are a repository path, line numbers and the enclosing function, taken from the master branches as retrieved on 18 November 2026; the linked files may since have moved on. The books are in copyright and the source code is LGPL and GPL, so records state facts and cite locations and never reproduce a passage or code.

The kit is judged only against Windows 95 rules: a record of any other era has the status `not-applicable`. A status of `matches` or `differs` always names what was looked at and how. Open questions, where the sources disagree or do not reach Windows 95, are records with low confidence and the status `unknown`.

```js
import { findRules, getRule, summarizeRegister } from './kit/evidence/register.mjs';

findRules({ query: 'shortcut', control: 'menu', era: 'win95-1995', kit_status: 'differs-unintended', confidence: 'high', limit: 5 });
getRule('edge-window-frame-raised-plain');
summarizeRegister();
```

`findRules` returns `{ schema_version: 1, compiled, kit_version_checked, caveat, total, items }`. Query terms must all occur in the record; a match in the ID, title or control ranks first, and ties keep register order. `topic` and `control` are exact and return nothing when unknown; `era`, `kit_status` and `confidence` must be one of their listed values and throw a short `TypeError` otherwise. `limit` is 1–20, default 20. `getRule` returns one record or `null`. `summarizeRegister` returns counts by kit status, confidence, era and topic, the topic and control vocabularies, the unintended differences ordered by visibility, and the open questions.

Every returned record puts a `standing` object directly after `id` and `title` and before `rule`: `era`, `era_label`, `confidence`, `confidence_reason`, `may_state_as_windows_95` and `cite_as`. `may_state_as_windows_95` is `yes` only for a `win95-1995` record of high confidence, `with-caveat` for medium, and `no` for a low-confidence record or any other era. The MCP tool `get_gui95_period_rules` returns the same shape; see [the service notes](mcp-service.md).

To change the register, edit `register.json` and run `node kit/evidence/build-register-doc.mjs`, which rewrites [docs/evidence-register.md](evidence-register.md). The same script with `--check` exits with an error when the document is out of date, and the tests run that check. When the kit changes, re-check the affected records' `kit` fields against the stylesheet and update `kit_version_checked`; a release that fixes an unintended difference should change that record's status in the same commit.

## Consumer manifests and version decisions

```json
{
  "schema_version": 1,
  "components": {
    "menu": "1.1.0",
    "dialog": "1.1.0",
    "number-field": "1.1.0"
  }
}
```

Stable control IDs are `menu`, `dialog`, `splitter`, `tree`, `toolbar`, `number-field`, `tabs`, and `listbox`; all eight are at **1.3.0**, and `tabs` and `listbox` were first released in 1.1.0. The separately versioned guidance IDs are `electron-shell`, `save-lifecycle`, `packaging`, and `scaling`, still at 1.0.0. Guidance IDs identify advice versions; they are not additional executable controls.

`checkUpdates(manifest)` accepts up to 50 component declarations and returns `{ schema_version: 1, status, components, errors }`, with components sorted by ID. A structurally invalid manifest returns `status: "invalid_manifest"`, an empty component list, and bounded errors. A valid structure returns `status: "ok"` even when an individual declaration is unknown or invalid; inspect each entry. Entries contain `id`, `installed`, `latest`, `status`, `compatibility`, matching repair IDs, `changes`, and a short explanatory `note`. For an older declaration, `changes` lists each later cataloged release up to `latest` as `{ version, date, summary }`; otherwise it is empty.

| Component status | Meaning | Initial compatibility report |
| --- | --- | --- |
| `current` | Exact version equals the latest catalog version | `unverified` for the consumer and host |
| `update_available` | Numerically older than the latest catalog version | `unsupported` across an older major or below the component's first release (for example `tabs` at 1.0.0); otherwise `unverified` |
| `newer_than_catalog` | Numerically newer than the catalog | `unverified`; no downgrade is recommended |
| `unknown_component` | ID absent from the release catalog | `unsupported`, with `latest: null` |
| `invalid_version` | Version is not an exact supported stable string | `unsupported` |

The catalog lists releases 1.0.0, 1.1.0, 1.1.1, 1.1.2, 1.2.0 and 1.3.0. An older numeric value that is not listed in a component's `released_versions` is not evidence of a real prior release, and no migration is tested. The checker compares declarations and does not install, modify, or execute anything. A version match never establishes browser, OS, Electron, accessibility, or application compatibility. The initial data deliberately makes no `verified` compatibility claim.

## Verification

Run `node --test kit/test/register.test.mjs` to check the register's record fields, links between draft and final rules, search filters, the `standing` object and that the generated document is up to date. Run `node --test kit/test/evidence.test.mjs` from the repository root to check source fields, local line bounds and preserved hashes, search limits and unknown inputs, repair ranges, executable regression references, and deterministic update decisions. Run the component test commands separately for current component behavior. Neither command runs archived consumer applications or replaces visible checks in their supported desktop hosts. See [provenance](provenance.md) and [integration lessons](integration-lessons.md) for that boundary.
