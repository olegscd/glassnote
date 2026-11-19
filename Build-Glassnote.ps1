<#
  Build-Glassnote.ps1 - turns glassnote.html into a Windows app (Tauri).
  Usage (from C:\Glassnote):
    .\Build-Glassnote.ps1          # check tools, install what's missing (asks first), build release\Glassnote.exe + installer
    .\Build-Glassnote.ps1 -Dev     # open the app in a dev window instead of building
  Or just double-click "Build Glassnote.bat".
#>
param([switch]$Dev)
$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

function Step($t) { Write-Host "`n==> $t" -ForegroundColor Cyan }
function Ok($t)   { Write-Host "    OK  $t" -ForegroundColor Green }
function Warn($t) { Write-Host "    !!  $t" -ForegroundColor Yellow }
function Ask($q)  { $a = Read-Host "    $q [y/N]"; return ($a -match '^(y|yes)$') }
function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
  $cargoBin = Join-Path $env:USERPROFILE '.cargo\bin'
  if ((Test-Path $cargoBin) -and ($env:Path -notlike "*$cargoBin*")) { $env:Path += ";$cargoBin" }
}
function Has($cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function Winget-Install($id, $extra) {
  if (-not (Has 'winget')) { throw "winget isn't available. Install '$id' manually, then run this again." }
  $wargs = @('install', '--id', $id, '-e', '--accept-package-agreements', '--accept-source-agreements')
  if ($extra) { $wargs += $extra }
  & winget @wargs
  Refresh-Path
}

Refresh-Path
Write-Host "Glassnote desktop build" -ForegroundColor White

# 1. Node.js
Step 'Node.js'
if (Has 'node') { Ok ("node " + (node --version)) }
elseif (Ask 'Node.js is missing. Install Node.js LTS with winget?') { Winget-Install 'OpenJS.NodeJS.LTS' $null; if (-not (Has 'node')) { throw 'Node installed - close this window and run the script again so PATH updates.' } }
else { throw 'Node.js is required.' }

# 2. Rust
Step 'Rust toolchain'
if (Has 'cargo') { Ok ((cargo --version) -join ' ') }
elseif (Ask 'Rust is missing. Install rustup with winget?') {
  Winget-Install 'Rustlang.Rustup' $null
  if (Has 'rustup') { rustup default stable-msvc | Out-Null }
  if (-not (Has 'cargo')) { throw 'Rust installed - close this window and run the script again so PATH updates.' }
} else { throw 'Rust is required to build the app.' }

# 3. MSVC C++ build tools (Rust needs the MSVC linker on Windows)
Step 'Visual Studio C++ Build Tools'
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
$vc = $null
if (Test-Path $vswhere) { $vc = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath }
if ($vc) { Ok "found at $vc" }
elseif (Ask 'C++ Build Tools are missing (about 2-6 GB). Install with winget?') {
  Winget-Install 'Microsoft.VisualStudio.2022.BuildTools' @('--override', '--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended')
  Ok 'installed (a restart may be needed if the build fails to link)'
} else { throw 'The MSVC C++ Build Tools are required.' }

# 4. WebView2 (built into Windows 11)
Step 'WebView2 runtime'
$wv = Get-ItemProperty -Path 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}' -ErrorAction SilentlyContinue
if ($wv) { Ok ("version " + $wv.pv) } else { Warn 'not detected - Windows 11 normally has it; the installer will fetch it if needed.' }

# 5. npm packages
Step 'npm packages'
if (-not (Test-Path 'node_modules\@tauri-apps\cli')) { npm install; if ($LASTEXITCODE) { throw 'npm install failed' } } else { Ok 'already installed' }

# 6. Build or run
if ($Dev) {
  Step 'Starting Glassnote in a dev window (close the window to stop)'
  npm run app
  exit $LASTEXITCODE
}
Step 'Building release (first build compiles Rust crates - takes a few minutes)'
npm run build:exe
if ($LASTEXITCODE) { throw 'Build failed - scroll up for the error. Tip: ask Antigravity to run /package-exe and fix it.' }

Step 'Collecting output'
$rel = Join-Path $PSScriptRoot 'release'
New-Item -ItemType Directory -Force -Path $rel | Out-Null
Copy-Item 'src-tauri\target\release\glassnote.exe' (Join-Path $rel 'Glassnote.exe') -Force
Get-ChildItem 'src-tauri\target\release\bundle\nsis\*.exe' -ErrorAction SilentlyContinue | Copy-Item -Destination $rel -Force
Ok "release\Glassnote.exe (portable) + installer are ready"
Start-Process explorer.exe $rel
