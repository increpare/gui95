# Structured generators

All public generators are synchronous and return `{files:[{path,text}],warnings}`.
Paths are relative POSIX paths. Text is UTF-8. The download builder adds the shared
`components/gui95.css`, `components/gui95.mjs` and source license to layout output.
Starter output already contains the source license and both byte-identical desktop
helpers. No generator executes supplied JavaScript or interpolates values into
inline scripts. HTML labels and JSON data are escaped independently.

## Layouts

```js
import {generateLayout} from './layout.mjs';
const output = generateLayout({
  type: 'preferences', title: 'Preferences', width: 480, height: 420,
  groups: [{id:'general',label:'General',fields:[
    {id:'name',type:'text',label:'Display name:',value:'User',required:true},
    {id:'volume',type:'number',label:'Volume:',value:50,min:0,max:100,step:1},
    {id:'wrap',type:'checkbox',label:'Word wrap',value:true}
  ]}],
  actions: [{id:'apply',label:'Apply',primary:true},{id:'cancel',label:'Cancel'}]
});
```

Types: properties, preferences, inspector, editor. Optional top-level fields are
rendered before groups. Each field requires a unique id. Types are text (default),
number, checkbox, select, textarea, range, color. Optional fields: label, help,
value, required, disabled; number/range additionally take finite min/max and positive
step; select requires 1–100 `{value,label}` options with unique values. Checkbox
values must be boolean, numeric values must be finite and within bounds, text
values must be strings, color uses #rrggbb. Labels default to ids. Duplicate ids
and unsupported values throw before output is produced.

Limits: 80 fields, 12 groups, 8 actions, ids of 1–64 letters/digits/hyphens starting
with a letter (gui95- is reserved), widths 240–1600, heights 180–1200. Titles are at
most 256 characters, labels 1024, help/description 2048, values 65536. Action ids
are independent from field ids; cancel restores the last commit. Other actions
submit the validated form and emit gui95:commit with `{action,values}`. Inspectors
also emit gui95:change for valid live values. Preferences store committed values in
localStorage. Editor layouts add a document textarea to connect to your app.

## Commands

```js
import {createCommandRegistry} from './commands.mjs';
const registry = createCommandRegistry([
  {id:'file.save',label:'Save',shortcut:'Primary+S',help:'Save document',
   target:'document',allowInEditable:true,enabled:ctx=>ctx.dirty,
   run:ctx=>save(ctx.document)},
  {id:'view.grid',label:'Grid',checked:ctx=>ctx.grid,run:()=>toggleGrid()}
], {context:{owner:'document',dirty:false}});
const dispose = registry.bind(document,{status:document.querySelector('[role=status]')});
registry.setContext({dirty:true});
```

Definition fields: id, run, label, help, shortcut, mnemonic, menu/group (mnemonic
scope), target (default application), enabled, checked, repeat, allowInEditable,
allowInDialog. IDs use letters/digits separated by dots/hyphens; duplicates throw.
Enabled/checked are booleans or context predicates. `run(context,event)` may be
async. execute(id,event) resolves true when executed and false when disabled,
owned elsewhere, or suppressed by repeat policy. The registry does not capture
listeners on import; bind installs listeners and returns a disposer.

Public methods: state(id), list(), diagnostics(), setContext(patch), getContext(),
refresh(), execute(id,event?), handleKeydown(event), bind(root,{status}).
Diagnostics report duplicate shortcuts and same-scope mnemonics. Shortcut modifiers
include Ctrl/Control, Meta/Cmd/Command, Alt/Option, Shift and Primary/CmdOrCtrl/Mod.
Use Plus for the plus key. Primary matches Meta on macOS and Ctrl elsewhere.

Native text entry, native button Space/Enter, toolbar/tree/tab/slider navigation,
composing input, and already-prevented events retain ownership. Global shortcuts
skip dialogs/menus unless explicitly allowed; document commands clicked in menus
dispatch to the current context owner. Explicit data-command-owner overrides the
owner. bind updates native disabled, aria-disabled, aria-pressed/aria-checked and
aria-keyshortcuts on data-command controls, and connects pointer/focus help to the
provided status element. onError receives rejected keyboard/click command work;
execute propagates its own rejection to its caller.

## Starter apps

```js
import {generateStarter} from './starters.mjs';
const output = generateStarter({template:'editor',name:'My Editor',id:'my-editor'});
```

Templates: utility (text case and counts), editor (document plus inspector), browser
(filterable local record collection plus document editor). Every template includes
working file actions, shared commands, word wrap, preferences, dirty prompts,
revision-aware saves that preserve existing file permissions (new documents use 0600 on POSIX), sandboxed context-isolated Electron native dialogs, browser
file picker/download fallback, persistent native window size, exact dependency
versions, a Makefile, gui95-app.json, runnable model tests and setup documentation.
Use `npm run install-app` or `make install` for desktop installation; npm's install
lifecycle is deliberately unused so a clean npm install only installs dependencies.

The public download adds components/. Source templates in runtime/ are copied as
actual modules rather than implementation placeholders. The native bridge exposes
only openText, saveText, getPreferences, savePreferences, with sender checks and
opaque file handles. There is no renderer path-based filesystem API. Unsupported
inputs throw; file content is capped at 4 MiB. Browser Save initiates a download
and cannot confirm the user kept it. The native close prompt provides Keep Editing
and Discard; save before closing to retain changes. macOS delivery follows the
shared Apple silicon standard. Signing and target-OS native verification remain
application release work.

## Verification

From the repository root, after installing kit/ development dependencies:

```
node --test kit/test/generators.test.mjs kit/test/generators-browser.test.mjs kit/test/icons.test.mjs
```

The tests execute generated model suites, parse all generated JS modules, check
helper byte identity, perform an offline clean npm install lifecycle check, run real
Chromium open/download/preferences/collection/form interactions, and reproduce
save-versus-edit, pending-open, menu-focus, storage-quota and save-error races. Native packaged behavior is
verified separately by the parent integration workflow.
