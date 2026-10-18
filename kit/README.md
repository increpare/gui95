# GUI95 build kit 1.0.0

Reusable Windows 95-style controls, original CC0 icons, layout generators and browser/Electron app starters. The JavaScript and CSS are MIT; only the new artwork in `icons/` is dedicated to CC0. Existing reference fonts retain their separate notices. The components use the host's available font; no font is bundled in generated apps.

## Get started

Download https://ded.increpare.com/gui95/kit.zip and extract it. Keep its `kit/`, `tools/`, LICENSE and notices together. The CLI needs Node.js 22 or newer, uses local files and makes no requests to the GUI95 publisher.

```sh
node kit/cli.mjs list
node kit/cli.mjs component dialog my-dialog
node kit/cli.mjs gallery my-gallery
node kit/cli.mjs icons save
node kit/cli.mjs icon save my-icon --size 32 --format png
node kit/cli.mjs starter editor my-editor --name "Example Editor" --id example-editor
node kit/cli.mjs evidence dialog focus
node kit/cli.mjs repairs pointer
node kit/cli.mjs updates gui95-consumer.json
```

Output directories must be new; generation never merges files into an existing project. Read a generated project's README before installing dependencies. Browser/Electron starters contain their own entry points, commands, preferences and native-file bridge. See `components/README.md` for enhancement markup and lifecycle behavior. The shared component runtime is included as a whole so individual extractions do not omit interaction dependencies.

## Structured layouts

Save this as `layout.json`, then run `node kit/cli.mjs layout layout.json my-properties`:

```json
{
  "type": "properties",
  "title": "Document properties",
  "fields": [
    { "id": "name", "label": "Name", "type": "text", "value": "Untitled" },
    { "id": "width", "label": "Width", "type": "number", "value": 640, "min": 1, "max": 4096 },
    { "id": "grid", "label": "Show grid", "type": "checkbox", "value": true }
  ],
  "actions": [{ "id": "apply", "label": "Apply", "primary": true }]
}
```

Other types are `preferences`, `inspector`, and `editor`. Fields can be grouped. Generated markup escapes text, and invalid or duplicate field IDs stop generation. The command registry in `generators/commands.mjs` can drive menu and toolbar instances from shared command definitions, including enabled/checked state, shortcuts, help and conflict diagnostics.

## Run local verification

Only browser verification requires Playwright. Install its pinned dependency and Chromium in the extracted kit:

```sh
npm --prefix kit ci --ignore-scripts
cd kit
npx playwright install chromium
cd ..
node kit/cli.mjs verify http://127.0.0.1:8000/components/gallery.html my-report
```

Serve the generated project with its documented server command, or use a local static HTTP server for the component gallery. Verification writes a JSON report and screenshots for device scales 1, 1.25, 1.5 and 2. The runner uses explicit component markers to discover applicable checks. Review screenshots for appearance; they do not prove screen-reader or native-window behavior. Test native dialogs, Electron title-bar behavior, text rendering and packaging in each intended operating system. Reports stay on your machine unless you explicitly choose to share them.

## Evidence and upgrades

Evidence records identify the claim, source kind, section or edition/page, date checked, applicability and limits. Historical Microsoft appearance guidance, current W3C interaction guidance and Electron host requirements are distinct kinds of evidence. The hosted service adds live reference hashes and URLs; a hash-bound reference URL returns 409 when that document has changed.

Record the versions integrated into your app:

```json
{ "schema_version": 1, "components": { "menu": "1.0.0", "dialog": "1.0.0" } }
```

Update checks identify current, older, newer, unknown and invalid versions. A repair is an integration safeguard with a reproducer; its applicability does not establish that a current kit release contains that defect. A listed test name is a reproducible check, not a claim it passed in your app.

## Hosted tools and artifacts

The MCP endpoint is https://ded.increpare.com/gui95/mcp. `list_gui95_kits` discovers the kit; specialized tools retrieve components/icons, generate layouts/starters, return evidence/repairs, and check a consumer manifest. File manifests include byte counts and SHA-256 values. Large files are supplied completely through ZIP downloads rather than truncated into tool responses.

Generated downloads are held in bounded memory for up to 15 minutes, may be evicted sooner, and disappear on restart. Anyone with the URL can retrieve the generated output while it is present. Generation inputs and outputs are not written into the private feedback inbox. Use the local CLI for private specifications.

The original icon pack is also available at https://ded.increpare.com/gui95/icons.zip, with a preview at https://ded.increpare.com/gui95/icons. Reference excerpts and existing application artwork have their own licenses; the icon dedication does not change those terms.
