param(
    [Parameter(Mandatory = $true)][string]$Vector95,
    [Parameter(Mandatory = $true)][string]$SausageMusic
)
$ErrorActionPreference = 'Stop'
$destination = Split-Path $PSScriptRoot -Parent
$manifestPath = Join-Path $destination 'references/snapshot-manifest.json'
if (Test-Path -LiteralPath $manifestPath) {
    throw 'A snapshot already exists. Preserve it and review changes before collecting a new edition.'
}
$projects = @(
    @{name='vector95'; root=$Vector95; files=@(
        'index.html','package.json','README.md',
        'src/classic.css','src/menus.js','src/status-help.js','src/command-search.js',
        'src/app.js','src/layer-ui.js','src/color-dialog.js','src/canvas-dialog.js',
        'src/text-dialog.js','src/input-preferences.js','src/input-bindings.js',
        'src/palettes.js','src/palette-credits.txt','src/icons.js','src/artwork-preview.js',
        'electron/main.cjs','electron/preload.cjs',
        'src/generated/svg-assets.js','src/generated/svg-assets.css',
        'src/assets/README.md','src/vendor/ms_sans_serif.woff2',
        'src/vendor/ms_sans_serif_bold.woff2','src/vendor/font-LICENSE.txt',
        'scripts/vendor.mjs','scripts/svg-assets.mjs',
        'tests/ui/control-polish.spec.mjs','tests/ui/keyboard-focus.spec.mjs',
        'tests/ui/status-help.spec.mjs','tests/ui/svg-assets.spec.mjs',
        'tests/ui/search-transform.spec.mjs','tests/ui/studio.spec.mjs',
        'artifacts/controls-1.png','artifacts/controls-1.25.png',
        'artifacts/controls-1.5.png','artifacts/controls-2.png',
        'artifacts/layer-ui-checks/game-art-scene.png',
        'artifacts/layer-ui-checks/game-art-font-dialog.png'
    ); directories=@('src/assets/icons','src/assets/captions','src/assets/scrollbars')},
    @{name='sausage-music'; root=$SausageMusic; files=@(
        'web/site/radio.html','web/site/radio.css','web/site/radio.js',
        'web/site/radio-mobile.js','web/site/radio-mobile.css',
        'web/site/radio-mobile.html','web/site/radio-mobile-text.js',
        'web/site/ms_sans_serif.woff2','web/site/ms_sans_serif_bold.woff2',
        'web/site/ms-sans-serif-readme.txt','web/site/ms-sans-serif-license.txt',
        'web/site/ms-sans-serif-bold-readme.txt','web/site/ms-sans-serif-bold-license.txt',
        'web/site/win31-notices.txt',
        'web/test/radio_test.mjs','web/test/radio_mobile_test.mjs',
        'web/electron/preload.js','web/electron/window_controls.js',
        'web/electron/test/window_controls_test.mjs'
    ); directories=@()}
)
$entries = @()
$provenance = @()
foreach ($project in $projects) {
    $sourceRoot = (Resolve-Path -LiteralPath $project.root).Path
    $head = (Get-Content -LiteralPath (Join-Path $sourceRoot '.git/HEAD') -Raw).Trim()
    $revision = $head
    if ($head.StartsWith('ref: ')) {
        $refPath = Join-Path $sourceRoot ('.git/' + $head.Substring(5))
        $revision = if (Test-Path -LiteralPath $refPath) { (Get-Content -LiteralPath $refPath -Raw).Trim() } else { 'unresolved symbolic ref: ' + $head }
    }
    $provenance += [ordered]@{project=$project.name; head=$revision; capture='Working-tree file contents; HEAD is context, not proof of a clean checkout.'}
    $paths = @($project.files)
    foreach ($dir in $project.directories) {
        $paths += Get-ChildItem -LiteralPath (Join-Path $sourceRoot $dir) -File | ForEach-Object { $dir + '/' + $_.Name }
    }
    foreach ($relative in $paths) {
        $source = Join-Path $sourceRoot $relative
        if (!(Test-Path -LiteralPath $source -PathType Leaf)) { throw "Missing selected source: $source" }
        $targetRelative = 'references/' + $project.name + '/' + $relative
        $target = Join-Path $destination $targetRelative
        New-Item -ItemType Directory -Force -Path (Split-Path $target -Parent) | Out-Null
        Copy-Item -LiteralPath $source -Destination $target
        $hash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()
        if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $hash) { throw "Copy mismatch: $targetRelative" }
        $entries += [ordered]@{project=$project.name; source=$relative; path=$targetRelative; sha256=$hash; bytes=(Get-Item -LiteralPath $target).Length}
    }
}
[ordered]@{
    edition='2026-10-14'; capturedAt=[DateTimeOffset]::UtcNow.ToString('o');
    purpose='Selected UI source evidence, assets and existing tests. This is not a runnable application distribution.';
    projects=$provenance; files=$entries
} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifestPath -Encoding utf8
Write-Output "Preserved and hash-verified $($entries.Count) files."
