$ErrorActionPreference = 'Stop'
$referenceRoot = Split-Path $PSScriptRoot -Parent
$manifest = Get-Content -LiteralPath (Join-Path $referenceRoot 'references/snapshot-manifest.json') -Raw | ConvertFrom-Json
$failures = @()
foreach ($required in @('LICENSE', 'THIRD-PARTY-NOTICES.md')) {
    if (!(Test-Path -LiteralPath (Join-Path $referenceRoot $required) -PathType Leaf)) {
        $failures += "Missing distribution notice: $required"
    }
}
foreach ($entry in $manifest.files) {
    $path = Join-Path $referenceRoot $entry.path
    if (!(Test-Path -LiteralPath $path -PathType Leaf)) { $failures += "Missing snapshot: $($entry.path)"; continue }
    if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.sha256) {
        $failures += "Snapshot changed: $($entry.path)"
    }
}
$documents = @((Get-Item -LiteralPath (Join-Path $referenceRoot 'README.md')))
if (Test-Path -LiteralPath (Join-Path $referenceRoot 'THIRD-PARTY-NOTICES.md')) {
    $documents += Get-Item -LiteralPath (Join-Path $referenceRoot 'THIRD-PARTY-NOTICES.md')
}
if (Test-Path -LiteralPath (Join-Path $referenceRoot 'SKILL.md')) {
    $documents += Get-Item -LiteralPath (Join-Path $referenceRoot 'SKILL.md')
}
$documents += Get-ChildItem -LiteralPath (Join-Path $referenceRoot 'docs') -File -Filter '*.md'
if (Test-Path -LiteralPath (Join-Path $referenceRoot 'examples/widgets')) {
    $documents += Get-ChildItem -LiteralPath (Join-Path $referenceRoot 'examples/widgets') -File -Filter '*.md'
}
$linkCount = 0
foreach ($doc in $documents) {
    $content = Get-Content -LiteralPath $doc.FullName -Raw
    foreach ($match in [regex]::Matches($content, '\]\(([^)]+)\)')) {
        $target = $match.Groups[1].Value
        if ($target -match '^(https?://|#|mailto:)') { continue }
        $target = [Uri]::UnescapeDataString(($target -split '#')[0])
        $linkCount++
        if (!(Test-Path -LiteralPath (Join-Path $doc.DirectoryName $target))) {
            $failures += "Broken local link in $($doc.Name): $target"
        }
    }
}
if ($failures.Count) { throw ($failures -join "`n") }
Write-Output "Verified $($manifest.files.Count) snapshot hashes and $linkCount local documentation links."
