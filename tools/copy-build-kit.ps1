param([Parameter(Mandatory = $true)][string]$Destination)
$ErrorActionPreference = 'Stop'
$sourceRoot = Split-Path $PSScriptRoot -Parent
$kitRoot = Join-Path $Destination 'kit'
New-Item -ItemType Directory -Path $kitRoot -Force | Out-Null
# Explicit source inventory excludes installed dependencies, reports and local artifacts.
foreach ($item in @('components', 'evidence', 'generators', 'icons', 'verify', 'test', 'README.md', 'cli.mjs', 'distribution.mjs', 'package.json', 'package-lock.json', 'verification.json')) {
    Copy-Item -LiteralPath (Join-Path $sourceRoot ('kit/' + $item)) -Destination $kitRoot -Recurse
}
