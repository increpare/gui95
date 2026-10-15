$ErrorActionPreference = 'Stop'
$sourceRoot = Split-Path $PSScriptRoot -Parent
$outputRoot = Join-Path $sourceRoot 'dist'
$skillRoot = Join-Path $outputRoot 'gui95'
$archivePath = Join-Path $outputRoot 'gui95.zip'

# Never mix a new edition with stale files or overwrite an existing package.
if ((Test-Path -LiteralPath $skillRoot) -or (Test-Path -LiteralPath $archivePath)) {
    throw 'A skill package already exists in dist. Preserve or remove that package before rebuilding.'
}
& (Join-Path $PSScriptRoot 'verify-reference.ps1')
New-Item -ItemType Directory -Path $skillRoot -Force | Out-Null
foreach ($item in @('SKILL.md', 'README.md', 'LICENSE', 'THIRD-PARTY-NOTICES.md', 'agents', 'docs', 'references')) {
    Copy-Item -LiteralPath (Join-Path $sourceRoot $item) -Destination $skillRoot -Recurse
}
New-Item -ItemType Directory -Path (Join-Path $skillRoot 'demo') -Force | Out-Null
foreach ($item in @('README.md', 'QA.md', 'serve.mjs', 'dist')) {
    Copy-Item -LiteralPath (Join-Path $sourceRoot ('demo/' + $item)) -Destination (Join-Path $skillRoot 'demo') -Recurse
}
New-Item -ItemType Directory -Path (Join-Path $skillRoot 'tools') | Out-Null
foreach ($tool in @('verify-reference.ps1', 'package-skill.ps1', 'collect-reference.ps1')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $tool) -Destination (Join-Path $skillRoot 'tools')
}
& (Join-Path $skillRoot 'tools/verify-reference.ps1')
Compress-Archive -LiteralPath $skillRoot -DestinationPath $archivePath
Write-Output "Skill folder: $skillRoot"
Write-Output "Skill archive: $archivePath"
