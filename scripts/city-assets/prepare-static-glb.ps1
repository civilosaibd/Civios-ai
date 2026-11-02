[CmdletBinding()]
param(
  [Parameter(Mandatory=$true, Position=0)][string]$InputGlb,
  [Parameter(Mandatory=$true, Position=1)][string]$OutputGlb
)

$ErrorActionPreference = "Stop"

# Static props/buildings/vehicles only. Do not use for animated or skinned characters.
if (-not (Test-Path -LiteralPath $InputGlb -PathType Leaf)) {
  throw "Input GLB not found: $InputGlb"
}
$resolvedInput = (Resolve-Path -LiteralPath $InputGlb).Path
$outputFull = [System.IO.Path]::GetFullPath($OutputGlb)
if ($resolvedInput -eq $outputFull) {
  throw "Input and output must be different files."
}
if (-not (Get-Command gltf-transform -ErrorAction SilentlyContinue)) {
  throw "Install Node.js LTS and run: npm install --global @gltf-transform/cli"
}

$outputDir = Split-Path -Parent $outputFull
if ($outputDir) { New-Item -ItemType Directory -Force -Path $outputDir | Out-Null }
$base = [System.IO.Path]::Combine($outputDir, [System.IO.Path]::GetFileNameWithoutExtension($outputFull))

Write-Host "[1/5] Validate source GLB..."
gltf-transform validate $resolvedInput
if ($LASTEXITCODE -ne 0) { throw "Source GLB validation failed." }

Write-Host "[2/5] Inspect source GLB..."
gltf-transform inspect $resolvedInput | Out-File -FilePath "$base.inspect.txt" -Encoding utf8
if ($LASTEXITCODE -ne 0) { throw "Source inspection failed." }

Write-Host "[3/5] Optimize a copy; preserve hierarchy and avoid geometry simplification..."
gltf-transform optimize $resolvedInput $outputFull --compress meshopt --texture-compress webp --texture-size 2048 --no-simplify --no-flatten --no-join
if ($LASTEXITCODE -ne 0) { throw "Optimization failed." }

Write-Host "[4/5] Validate and inspect optimized GLB..."
gltf-transform validate $outputFull
if ($LASTEXITCODE -ne 0) { throw "Optimized GLB validation failed." }
gltf-transform inspect $outputFull | Out-File -FilePath "$base.optimized.inspect.txt" -Encoding utf8
if ($LASTEXITCODE -ne 0) { throw "Optimized inspection failed." }

Write-Host "[5/5] SHA-256 checksums..."
Get-FileHash -Algorithm SHA256 -LiteralPath $resolvedInput, $outputFull | Format-Table -AutoSize

Write-Warning "NOT APPROVED: visually inspect dimensions, materials, normals, UVs, animation state and silhouette in Blender and the target app."
Write-Host "Reports: $base.inspect.txt and $base.optimized.inspect.txt"
