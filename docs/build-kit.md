# GUI95 build kit

The optional build kit complements the preserved reference collection with maintained, standalone material. Its source and local CLI are in [kit/README.md](../kit/README.md). Version 1.0.0 supplies six controls, a local Chromium verification runner, original CC0 icons, four structured layouts, a shared command registry, three browser/Electron starters, precise evidence records, integration repairs and consumer-version checks.

Use a starter for a new application, a component kit for an existing architecture, and the evidence/repair catalog when a decision or defect needs explanation. The six controls share one CSS file and runtime so extracted controls retain their input ownership and lifecycle behavior. Generated apps use those same components. Preserved Vector95 and ProcGen FM files remain historical source evidence and are not modified by build-kit development.

## Hosted interface

| Tool | Result |
| --- | --- |
| `list_gui95_kits` | Versions, available controls/layouts/starters, preview/download URLs and local verification entry point |
| `get_gui95_component` | Complete scoped CSS/runtime/instructions and file hashes |
| `get_gui95_icons` | Semantic icon search or a specific original CC0 SVG/PNG variant |
| `generate_gui95_layout` | Parameterized properties/preferences/inspector/editor files |
| `generate_gui95_starter` | Utility/document-editor/list-detail browser with browser and Electron entry points |
| `get_gui95_evidence` | Claim-specific sources, source type, section/page, applicability and local content identity |
| `get_gui95_repairs` | Symptoms, causes, integration changes and regression scenarios |
| `check_gui95_updates` | Comparison of a bounded component-version manifest to the release catalog |

The existing reference search/read and explicit private-feedback tools remain available. All new tools are read-only: they produce or retrieve files and guidance, and never modify a consumer project or execute its code on the service.

Downloads use a file manifest and SHA-256-identified ZIP. The standalone kit and icon archive are permanent routes; individual generated artifacts expire from a bounded in-memory cache. Regenerate a request after eviction. Inputs can include application labels and sample values, so the [privacy information](../PRIVACY.md) describes the temporary output cache. Ordinary tool arguments never enter feedback storage automatically.

## Source and verification scope

Read [build-kit evidence](build-kit-evidence.md) for source classification and repair applicability. The local suite exercises actual Chromium controls; its device scale emulation is not a claim of native Windows, macOS or Linux UI certification. Starters pin exact Electron/build dependencies, but the consuming app must install dependencies, build and run in its intended host. The [desktop delivery standard](desktop-delivery.md) still defines cross-platform package/install conventions.

Original icon art uses CC0, with its own dedication and provenance. Runtime/generator/helper code uses the repository's MIT grant. No font from the preserved reference apps is silently included or relicensed.
