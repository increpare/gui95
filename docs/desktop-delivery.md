# Desktop delivery standard

This is the standard for building, packaging and installing a GUI95 desktop app on Windows, macOS and Linux. An app that follows it answers the same `make` commands, describes itself in one `gui95-app.json` file, and carries two small scripts that are copied into it unchanged: [`tools/gui95-app.mjs`](../tools/gui95-app.mjs) makes the compressed copy and installs the app, and [`tools/gui95-icons.mjs`](../tools/gui95-icons.mjs) makes the icons from SVG files.

It puts the [startup and packaging principle](design-guide.md#startup-and-desktop-packaging) into practice: the installed app is an unpacked app at a stable path, and installing a new build replaces it in place, so pinned icons, shortcuts and file types keep working across rebuilds. It is written for Electron apps built to an unpacked folder (electron-builder's `--dir` output, for example); the scripts only need that finished folder.

Each computer builds for itself, in its own checkout, so `node_modules`, Electron runtimes and build folders never mix between systems. The Windows 95 look stays the same on every system; what changes is behavior, covered under [platform conventions](#platform-conventions). Code signing, notarization, installers (`.msi`, NSIS, `.dmg`), app stores, automatic updates and universal or Intel macOS builds are outside this standard.

## Make targets

Every app repository answers `make` and `make install`, and `make serve` when it has a web version:

| Command | What it does |
| --- | --- |
| `make` | Builds the desktop app for the computer it runs on (Windows, macOS or Linux) as an unpacked app in the repository's build folder, and a compressed copy of it for passing on. Also builds the web version, where the app has one. |
| `make serve` | Does what `make` does, then serves the web version and prints its address. It uses the app's usual port when that is free, and any free port otherwise. |
| `make install` | Does what `make` does, then installs the app for the current user (see [Installing](#installing)). |

Repositories keep their other targets. An app with no web version has nothing to serve and has no `make serve`.

The free-port rule is the server's job: listen on the usual port and, when Node reports `EADDRINUSE`, listen on port `0` instead and print the address from `server.address()`, so the printed address is the one in use.

### Repositories with several apps

Choose deliberately which app or suite plain `make` builds. Keep other apps as named targets unless the requested default is the complete suite. Sharing an engine or an Electron dependency directory does not make every companion app part of that default.

GNU Make merges prerequisites from repeated ordinary target rules. An `all: editor` rule followed by a Windows-only `all: legacy-player` rule builds both on Windows; the later rule does not replace the earlier dependencies. Setting `.DEFAULT_GOAL := all` selects the goal but does not change that merging. Inspect every rule for the default goal, including conditional ones, when introducing or renaming an app.

Keep the default target, README instructions and final completion message consistent. Print the intended app's name, actual output path and applicable launch instructions after the build and archive succeed. A companion app's final success message can conceal an otherwise successful primary build and send the user to the wrong executable. Check `gui95-app.json` too: the delivery helper enumerates its configured apps for this host, so the build must produce the app set that its pack/install commands expect.

Verify plain `make` itself on the intended host and read its complete output through the final lines. Testing only `make editor` misses dependencies attached to `all`. Check the explicit companion targets separately, using a dry run when no new package is needed. For a supported suite default, report every requested app clearly rather than leaving only whichever package ran last as the apparent result.

## Portable Makefiles

The same Makefile has to work under GNU Make on all three systems.

- **Keep targets thin.** A recipe calls a Node script or an npm script. Logic lives in the script, not in the recipe.
- **Use only what GNU Make 3.81 supports.** That is the version macOS ships. Avoid later additions such as `.ONESHELL`, `.SHELLFLAGS`, `.RECIPEPREFIX`, `$(file ...)`, `!=` and grouped targets (`&:`).
- **Write no shell-specific recipes.** On Windows, GNU Make from an MSYS2 distribution runs recipes with `sh`, not `cmd` or PowerShell. Keep to commands that mean the same in every shell; no PowerShell, no Bash-only syntax and no Windows-only tools, except inside a branch that runs only on that system.
- **Call npm as `npm.cmd` on Windows.** The bare `npm` name does not reliably run the Windows launcher when make starts it. Choose the name once, at the top: on Windows (`ifeq ($(OS),Windows_NT)`) set `NPM := npm.cmd`, otherwise `NPM ?= npm`. Set `NODE ?= node` beside it, and let both be overridden from the command line.
- **Start make from PowerShell or cmd on Windows.** An MSYS2-based make (devkitPro's, for example) started from Git Bash can lose the `OS` and `COMSPEC` environment variables, so `ifeq ($(OS),Windows_NT)` misfires and `npm ci` can fail. A tool that runs `make` for several apps can restore both variables for the makes it starts.

A minimal Makefile for "Example App", which has a web version served by `scripts/serve.mjs` and no web build step:

```make
NODE ?= node
ifeq ($(OS),Windows_NT)
NPM := npm.cmd
else
NPM ?= npm
endif

.PHONY: all serve install

all: node_modules/.package-lock.json
	$(NODE) scripts/gui95-icons.mjs
	$(NPM) run build
	$(NODE) scripts/gui95-app.mjs pack

serve: all
	$(NODE) scripts/serve.mjs

install: all
	$(NODE) scripts/gui95-app.mjs install

node_modules/.package-lock.json: package-lock.json
	$(NPM) ci
```

Recipe lines start with a tab. `npm run build` is the app's own build script, such as `electron-builder --dir`, and leaves the unpacked app in the folder that `gui95-app.json` names. If the web version has a build step, add it to `all`.

### Keep desktop installation out of npm lifecycle hooks

Name an explicit npm desktop-install action `install:app` (or call the helper from `make install`). Do not name it `install`: both `npm install` and `npm ci` automatically execute the npm `install` lifecycle script. A freshly generated app then tries to install its desktop build before that build exists; an existing app can unexpectedly replace its installed copy while dependencies are being updated. Keep dependency installation and explicit desktop delivery separate actions. See [npm lifecycle operation order](https://docs.npmjs.com/cli/v11/using-npm/scripts#life-cycle-operation-order).

## `gui95-app.json`

A file named `gui95-app.json` at the repository root describes the apps the repository builds. `pack` and `install` read it, and so does the icon script. A repository can list more than one app.

| Field | Meaning |
| --- | --- |
| `apps` | Required, a non-empty array with one entry per app (below). |
| `icons` | Optional array of icons to generate from SVG files; see [Icons](#icons). |

Each entry of `apps`:

| Field | Meaning |
| --- | --- |
| `id` | Required. Lowercase letters, digits and hyphens, starting with a letter or digit. Names the Linux install folder and desktop entry. |
| `name` | Required. The display name, spaces allowed. It may not contain `\ / : * ? " < > \|` and must hold more than dots and spaces. Names the install folder (Windows), the bundle (macOS), the Start menu shortcut and the archive. |
| `version` | Required. The path, relative to the repository, of a JSON file with a `version` string, normally `package.json`. |
| `icon` | The path of a PNG, relative to the repository. Required when there is a Linux build: `install` copies it into the app as the icon of its desktop entry. |
| `builds` | Required. An object with at least one of `windows`, `macos` and `linux`, and no other key. A system that is left out means "no build for this system yet": `pack` and `install` skip the app there and say so. |
| `fileTypes` | Optional array of the file types the app opens. |

Each entry of `builds`:

| Key | Fields |
| --- | --- |
| `windows` | `dir`: the folder with the unpacked app, relative to the repository (for example `release/win-unpacked`). `exe`: the executable inside it, relative to `dir`. |
| `macos` | `dir`: the folder that holds the bundle. `bundle`: the name of the bundle inside it, ending in `.app`. |
| `linux` | `dir` and `exe`, as for Windows. |

Each entry of `fileTypes`:

| Field | Meaning |
| --- | --- |
| `ext` | Required. The extension without a leading dot. |
| `name` | Required. The name of the file type, for example "Example document". |
| `progId` | Required when there is a Windows build. The registry name of the type, for example `ExampleApp.Document`. |
| `windowsIcon` | Required when there is a Windows build. The path of an `.ico` file inside the installed app folder, for example `resources/document.ico`. The Windows shell cannot read inside an asar archive, so copy the file out with electron-builder's `extraResources`. |
| `mime` | Required when there is a Linux build. The MIME type, for example `application/x-example`. |

On macOS the bundle declares the file types it opens in its own `Info.plist` (electron-builder writes it from `fileAssociations`); `install` only registers the bundle with Launch Services.

A mistake in the file stops `pack` or `install` before anything is changed, with a message that starts `gui95-app.json:` and names the field. A complete example:

```json
{
  "apps": [
    {
      "id": "example-app",
      "name": "Example App",
      "version": "package.json",
      "icon": "gui95-icons/app.png",
      "fileTypes": [
        {
          "ext": "exa",
          "name": "Example document",
          "mime": "application/x-example",
          "progId": "ExampleApp.Document",
          "windowsIcon": "resources/document.ico"
        }
      ],
      "builds": {
        "windows": { "dir": "release/win-unpacked", "exe": "Example App.exe" },
        "macos": { "dir": "release/mac-arm64", "bundle": "Example App.app" },
        "linux": { "dir": "release/linux-unpacked", "exe": "example-app" }
      }
    }
  ],
  "icons": [
    { "name": "app", "svg": "art/app.svg", "style": "pixel" },
    { "name": "document", "svg": "art/app.svg", "style": "pixel", "document": true, "master": 64 }
  ]
}
```

## The helper

Copy [`tools/gui95-app.mjs`](../tools/gui95-app.mjs) to `scripts/gui95-app.mjs` in the app, unchanged. The copy lives in `scripts/` at the root of the repository, where a suite of apps looks for it, even when the app's own code lives in a subfolder. It needs Node 20.11 or newer and uses only Node's built-in modules, so nothing is added to `package.json`. Every app keeps a byte-identical copy so that each repository builds and installs on its own, and so that copies can be compared. Never edit the copy in an app: change the original and copy it again to every app.

Run it from the repository root:

```text
node scripts/gui95-app.mjs pack
node scripts/gui95-app.mjs install
```

`pack` makes the compressed copy of each app built for this system; `install` installs each one for the current user. Both read `gui95-app.json` and check every app's build before they change anything, so a missing build stops the run with nothing half done (`no build at <folder>; run the build first.`). Both exit with 0 when done, 1 when something failed (the reason goes to stderr) and 2 for a command they do not know.

Add the output folder to `.gitignore`:

```text
gui95-dist/
```

## Compressed copies

`pack` writes one compressed copy of each app built for the computer it runs on to `gui95-dist/`, replacing an earlier copy of the same name.

| System | Format | Notes |
| --- | --- | --- |
| Windows | `.zip` of the unpacked app folder | Windows' built-in `tar.exe` can write zip files. The helper calls it by its full path in `System32`, because another `tar` earlier on `PATH` (the GNU one that comes with MSYS or Git Bash) cannot. |
| macOS | `.zip` of the `.app` bundle, made with `ditto -c -k --keepParent` | Ordinary zip tools break the symbolic links inside an app bundle. |
| Linux | `.tar.gz` of the unpacked app folder | Keeps file permissions and links. |

File names follow `<Name>-<version>-<windows|macos|linux>-<architecture>.<ext>`, with any spaces in the name replaced by hyphens, the version read from the app's `version` file and the architecture the computer's own (`x64` or `arm64`): `Example-App-1.2.0-windows-x64.zip`. Each archive has one top-level entry: `<Name>/` on Windows and Linux, the `.app` bundle on macOS.

On Windows and Linux `pack` briefly moves the build folder into `gui95-dist/.stage/` while it writes the archive, and moves it back afterwards, so do not run the app from its build folder while packing. A `pack` that is stopped part way (Ctrl-C) can leave the build in `.stage/`; the next `pack` moves it back, or deletes it when the build folder has been built again since.

The copies are unsigned: there is no developer certificate and no notarization. The macOS build is signed only ad hoc, without an identity, so someone who downloads that copy will see a security warning. macOS builds made this way are for Apple silicon only.

### Verify shipped commands and resources

A development page can load modules that the packaged app's resource allowlist omits. When adding an import/export command or worker, include its transitive modules, data, runtime files and styles in the shipped inventory. Verify the packaged executable's actual command, including any native file-dialog bridge and worker path; starting its main window does not establish that the new feature is usable. Test offline where the app promises offline use, with an isolated profile and a representative source document. For a converted foreign document, confirm that Save asks for a new destination and preserves the original file, following the [conversion contract](integration-lessons.md#imported-conversions-need-a-new-save-destination).

## Installing

`install` installs each app built for this system for the current user. It needs no administrator rights, and it replaces the previous copy in place.

| System | App goes to | Launched from |
| --- | --- | --- |
| Windows | `%LOCALAPPDATA%\Programs\GUI95\<Name>\` | A Start menu folder named GUI95 (`%APPDATA%\Microsoft\Windows\Start Menu\Programs\GUI95\`), one shortcut per app. Pin to the taskbar from there. |
| macOS | `~/Applications/GUI95/<Name>.app` | Spotlight, Launchpad and the Dock. |
| Linux | `~/.local/share/gui95/<id>/` | The desktop's app menu, through `~/.local/share/applications/gui95-<id>.desktop`. `$XDG_DATA_HOME` replaces `~/.local/share` when it is set. |

The new copy is made next to the installed one, as `<folder>.gui95-new`, and swapped in only when it is complete; the old copy waits as `<folder>.gui95-old` until the swap is done. A leftover from an interrupted run is cleared by the next install, and the installed copy is put back if the swap fails. If even that fails, `install` says where the previous copy is, and the next install moves it back before it does anything else. If the app is running, `install` stops, leaves the installed copy as it was, and says `Close Example App and run make install again.` On Windows a running app is noticed because its folder cannot be renamed; on macOS and Linux `install` looks for a process started from the installed folder.

Once the copy is in place, `install` makes the app easy to reach:

- **Windows:** the Start menu shortcut, and for each file type the registry entries under `HKEY_CURRENT_USER\Software\Classes` (the `progId` key with its icon and an open command of `"<exe>" "%1"`, and the extension pointing at it).
- **macOS:** the copy is made with `ditto`, signed ad hoc again (the marker below is part of the bundle, so the signature has to come last) and registered with Launch Services.
- **Linux:** the icon is copied into the app folder, a desktop entry is written, and the desktop database is updated with `update-desktop-database`. For file types, the MIME definition also goes to `$XDG_DATA_HOME/mime/packages/gui95-<id>.xml` (under `~/.local/share` when `$XDG_DATA_HOME` is not set), the MIME database is updated with `update-mime-database`, and `xdg-mime` makes the app the default for each MIME type. A tool that is not installed is skipped with a warning.

Desktop integration is a convenience. A step that fails prints a warning on stderr and the rest still run, for every system, and `install` exits 0 once the app copy is in place. Only a failure to install the copy itself ends the run with an error.

### Replacing an installed app safely

Keep packaging output separate from the installed directory and use the helper's complete-copy/swap path for replacement. A packager that recursively removes its previous output can delete some installed files before Windows refuses a locked executable, DLL or archive. A failed build or update must leave the previous installation usable.

Prepare and verify the new build before interrupting the user's session. If replacement is blocked by the running app, retain the prepared copy and explain that the app must close before retrying. Let its normal Save/Discard/Cancel flow protect the document; do not terminate the process to release locks or assume that closing requires saving. Keep per-user documents, recovery drafts and preferences outside the replacement directory.

Verify the installed copy and normal stable launcher after replacement. Keep automated test profiles separate from the everyday profile, and confirm the actual visible window before claiming a successful relaunch. An incomplete process inventory from a restricted test environment is not evidence that no desktop instance is running.

### The installed marker

Every installed copy carries a file named `gui95-installed.json` in its resources folder: `<folder>/resources/` on Windows and Linux, `<Name>.app/Contents/Resources/` on macOS. It records which app and version were installed:

```json
{
  "id": "example-app",
  "name": "Example App",
  "version": "1.2.0",
  "installedAt": "2026-10-18T09:30:00.000Z"
}
```

The installed copy is the everyday copy. A test build, or `npm start`, must not take file types away from it. So an app that claims file types when it starts does so only when it is running from an installed location:

```js
const installed = fs.existsSync(path.join(process.resourcesPath, "gui95-installed.json"));
if (installed) {
  // claim the app's file types here
}
```

For the same reason the build makes no launch points for the build folder: no shortcut to it and no registration of its bundle with the system. A build can still be started directly for testing. Pin the installed copy to the taskbar or Dock once; later installs replace it in place, so the pin keeps working. Ordinary test launches and the installed copy share user data and the single-instance lock by default; automated checks should explicitly select an isolated test profile.

## Platform conventions

The look is the same everywhere; these conventions are about behavior.

**macOS**

- An app menu with a standard Edit menu, so Cmd+C, Cmd+V, Cmd+X, Cmd+A and Cmd+Z reach text fields. Cmd+Q quits.
- Cmd replaces Ctrl in the app's own shortcuts and in the shortcut labels it shows.
- Apps with file types open files from Finder. Electron reports them in the `open-file` event, which can arrive before the app is ready, so listen for it at the top of the main process.

Set the Electron menu template only on macOS:

```js
const { Menu } = require("electron");

if (process.platform === "darwin") {
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: "appMenu" }, { role: "editMenu" }, { role: "windowMenu" }]));
}
```

This minimal menu suits apps without a separate document Undo history. Editors with both text-field and document histories need [focus-aware Undo/Redo routing](integration-lessons.md#macos-route-undo-and-redo-to-their-owner), while retaining native clipboard roles. Verify menu actions and accelerators in the actual macOS app; inspecting a template on another host does not establish that routing works there.

**Windows**

- Ctrl shortcuts. The menu is the app's own menu bar; the Electron template is not set.
- The shortcut and file types that `install` registers start the installed executable, and a file arrives as a command-line argument.
- An installed build does not call `app.setAppUserModelId`. The Start menu shortcut that `install` makes carries no AppUserModelID, so a window with an explicit one would not match its pinned shortcut. Setting one only in a portable build is fine.

**Linux**

- Ctrl shortcuts, as on Windows. The Electron template is not set.
- An entry with its icon in the desktop's app menu, made by `install`.
- Apps with file types open them from the file manager, again as a command-line argument.

If the app takes a single-instance lock, a file opened while the app is running reaches the running copy in the `second-instance` event on Windows and Linux.

## Icons

SVG files are the only icon sources an app commits. The `.png`, `.ico` and `.icns` files each system needs are generated from them, the same way in every app, and are not committed.

Copy [`tools/gui95-icons.mjs`](../tools/gui95-icons.mjs) to `scripts/gui95-icons.mjs` in the app, unchanged, under the same rules as the helper above. It needs no browser and no npm dependencies. List the icons in the `icons` array of `gui95-app.json`, then run it from the repository root:

```text
node scripts/gui95-icons.mjs
```

For each icon it writes three files to `gui95-icons/`: `<name>.png` at 1024 px, `<name>.ico` with 16, 24, 32, 48, 64, 128 and 256 px images, and `<name>.icns` with 16 to 1024 px images. Add the folder to `.gitignore`:

```text
gui95-icons/
```

It exits 0 when the icons are made and 1 with the reason on stderr when not. Every icon is read and checked before any file is written.

### Listing icons

| Field | Meaning |
| --- | --- |
| `name` | Required. Lowercase letters, digits and hyphens, starting with a letter or digit, and unique in the list. Names the output files. |
| `svg` | Required. The SVG file, as a path inside the repository, relative to it. |
| `style` | Required. `pixel` or `smooth`. |
| `document` | Optional. `true` puts the picture on a document page, for file types. |
| `master` | Optional, pixel style only. The size of the drawing that larger sizes are enlarged from: 16, 32 (the default), 64, 128, 256, 512 or 1024. |

The two styles:

- **pixel** keeps hard Windows 95 pixels. It draws every size up to the larger of `master` and 48 px directly. Each pixel takes the color that covers most of it; translucent paints are blended with what is below them first. Only the sizes above that are enlarged: each is the `master` drawing enlarged by a whole number, so the hard edges survive at 1024 px.
- **smooth** is antialiased at every size, by supersampling (8 x 8 samples per pixel up to 256 px, 4 x 4 above), for detailed artwork.

A document icon puts the picture at half size on a Windows 95 document page: a white page with a folded gray corner and a black outline. With the pixel style, give a document icon a `master` of twice the plain icon's, as in the example above, so its pixels keep the plain icon's size.

### Using the icons

- **Regenerate them automatically.** `make` runs the icon script before the app's build (see the example Makefile), and a `prestart` npm script makes a fresh checkout run with its icons:

  ```json
  {
    "scripts": {
      "prestart": "node scripts/gui95-icons.mjs"
    }
  }
  ```

- **Point the build at them.** In electron-builder's configuration, set `win.icon`, `mac.icon` and `linux.icon` to the generated `.ico`, `.icns` and `.png`, point file-association icons at the document icon, and include `gui95-icons/**` in the packaged files. electron-builder looks for an icon path in its build resources folder and then in the project folder, so paths from the project root work:

  ```json
  {
    "build": {
      "files": ["src/**", "gui95-icons/**"],
      "win": { "icon": "gui95-icons/app.ico" },
      "mac": {
        "icon": "gui95-icons/app.icns",
        "fileAssociations": [{ "ext": "exa", "name": "Example document", "icon": "gui95-icons/document.icns" }]
      },
      "linux": { "icon": "gui95-icons/app.png" },
      "extraResources": [{ "from": "gui95-icons/document.ico", "to": "document.ico" }]
    }
  }
  ```

  The `extraResources` entry puts the Windows document icon where `windowsIcon` in `gui95-app.json` finds it, as `resources/document.ico`.

- **Use the same files in the window.** On Windows give the `BrowserWindow` the `.ico` as its `icon`, or leave `icon` unset to use the executable's icon: given one bitmap, Electron scales it down and blurs pixel-style icons. On Linux give it the 1024 px PNG. Both come from the packaged `gui95-icons/` folder. macOS uses the bundle's icon.

### The SVG subset

The script draws a stated subset of SVG, not a browser's. Anything else is refused with an error that names the element, attribute or path command, so a feature the icons cannot show never drops out silently.

- **Structure:** a root `<svg>` with a `viewBox` of four numbers (a positive width and height); `<g>`; `<path>`, `<rect>` (without rounded corners), `<circle>`, `<ellipse>` and `<polygon>`. Numbers are plain numbers without units.
- **Path commands:** `M L H V C S Q T Z`, in absolute and relative forms. Arcs (`A`) are not supported; draw them with curves.
- **Transforms:** `translate`, `scale` and `matrix`. Write a rotation as a `matrix`.
- **Painting:** `fill`, `fill-rule` (`nonzero` or `evenodd`), `fill-opacity`, `opacity`, `stroke`, `stroke-width`, `stroke-linejoin` (`miter`, `round` or `bevel`), `stroke-miterlimit` and `display` (`none` or `inline`). Colors are `#rgb`, `#rrggbb`, `none`, `black` and `white`. The fill and stroke attributes are inherited as in SVG. An element's `opacity` applies to it and its content as a whole.
- **Ignored:** comments, `<metadata>`, `<title>`, `<desc>`, and attributes that only label or size the picture (`id`, `class`, `data-*`, `aria-*`, the root's `width` and `height`, and similar).
- **Refused:** everything else, for example `<text>`, `<use>`, gradients, `<line>` and `<polyline>` (write them as paths), a `style` attribute, other color names and `rotate()`.

Two simplifications apply. Strokes have plain (butt) ends. A stroke's width scales with the square root of the transform's area scale, so avoid stretching a stroked shape unevenly.

Joins are as in SVG: miter by default, turning into a bevel beyond the miter limit, with a default miter limit of 4 (`stroke-miterlimit` changes it).

An app whose artwork needs more extends the original script in the skill and copies it again to every app, rather than editing its own copy.
