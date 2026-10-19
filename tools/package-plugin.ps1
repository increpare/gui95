$ErrorActionPreference = 'Stop'
$sourceRoot = Split-Path $PSScriptRoot -Parent
$pluginRoot = Join-Path $sourceRoot 'dist/gui95-plugin'
$archivePath = Join-Path $sourceRoot 'dist/gui95-plugin.zip'
if ((Test-Path -LiteralPath $pluginRoot) -or (Test-Path -LiteralPath $archivePath)) {
    throw 'A plugin package already exists in dist. Preserve it before rebuilding.'
}
$sourceManifest = Get-Content -LiteralPath (Join-Path $sourceRoot 'plugin/.codex-plugin/plugin.json') -Raw | ConvertFrom-Json
if ($sourceManifest.interface.PSObject.Properties.Name -contains 'screenshots') {
    throw 'Skills-only directory packages must omit interface.screenshots; listing screenshots require an MCP server with custom UI.'
}
& (Join-Path $PSScriptRoot 'verify-reference.ps1')
New-Item -ItemType Directory -Path $pluginRoot -Force | Out-Null
foreach ($item in @('.codex-plugin', 'assets')) {
    Copy-Item -LiteralPath (Join-Path $sourceRoot ('plugin/' + $item)) -Destination $pluginRoot -Recurse -Force
}
foreach ($item in @('LICENSE', 'PRIVACY.md')) {
    Copy-Item -LiteralPath (Join-Path $sourceRoot $item) -Destination $pluginRoot
}
$skillRoot = Join-Path $pluginRoot 'skills/gui95'
New-Item -ItemType Directory -Path $skillRoot -Force | Out-Null
foreach ($item in @('SKILL.md', 'README.md', 'LICENSE', 'THIRD-PARTY-NOTICES.md', 'PRIVACY.md', 'agents', 'docs', 'references', 'examples')) {
    Copy-Item -LiteralPath (Join-Path $sourceRoot $item) -Destination $skillRoot -Recurse
}
& (Join-Path $PSScriptRoot 'copy-build-kit.ps1') -Destination $skillRoot
New-Item -ItemType Directory -Path (Join-Path $skillRoot 'demo') -Force | Out-Null
foreach ($item in @('README.md', 'QA.md', 'serve.mjs', 'dist')) {
    Copy-Item -LiteralPath (Join-Path $sourceRoot ('demo/' + $item)) -Destination (Join-Path $skillRoot 'demo') -Recurse
}
New-Item -ItemType Directory -Path (Join-Path $skillRoot 'tools') -Force | Out-Null
foreach ($item in @('verify-reference.ps1', 'package-skill.ps1', 'copy-build-kit.ps1', 'collect-reference.ps1', 'gui95-app.mjs', 'gui95-icons.mjs', 'build-widget-examples.mjs')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $item) -Destination (Join-Path $skillRoot 'tools')
}
& (Join-Path $skillRoot 'tools/verify-reference.ps1')
$manifest = Get-Content -LiteralPath (Join-Path $pluginRoot '.codex-plugin/plugin.json') -Raw | ConvertFrom-Json
if ($manifest.interface.displayName.Length -gt 30 -or $manifest.interface.shortDescription.Length -gt 30 -or $manifest.interface.longDescription.Length -gt 4000) { throw 'Listing text exceeds submission limits.' }
foreach ($prompt in $manifest.interface.defaultPrompt) {
    if ($prompt.Length -gt 128) { throw 'Starter prompt exceeds 128 characters.' }
}
foreach ($asset in @($manifest.interface.logo, $manifest.interface.composerIcon)) {
    if (!(Test-Path -LiteralPath (Join-Path $pluginRoot $asset) -PathType Leaf)) { throw "Missing listing asset: $asset" }
}
# Unlike Compress-Archive, this preserves dot-directories on every platform.
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($pluginRoot, $archivePath, [IO.Compression.CompressionLevel]::Optimal, $true)
Write-Output "Plugin archive: $archivePath"
