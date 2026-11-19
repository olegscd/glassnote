<#
  Build-Glassnote-APK.ps1 - packages glassnote.html into an Android APK (release\Glassnote.apk).
  Usage (from C:\Glassnote):
    .\Build-Glassnote-APK.ps1           # build debug-signed APK (ready to sideload onto any Android device)
    .\Build-Glassnote-APK.ps1 -Install  # also install to a connected device/emulator via adb
#>
param([switch]$Install)
$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

function Step($t) { Write-Host "`n==> $t" -ForegroundColor Cyan }
function Ok($t)   { Write-Host "    OK  $t" -ForegroundColor Green }

# 1. Locate JDK 17+
Step 'JDK 17+'
$jdkCandidates = @(
  $env:JAVA_HOME,
  (Join-Path $env:LOCALAPPDATA 'Programs\jdk-17'),
  'C:\Program Files\Android\Android Studio\jbr',
  'C:\Program Files\Eclipse Adoptium\jdk-17*'
)
$jdk = $null
foreach ($c in $jdkCandidates) {
  if (-not $c) { continue }
  $resolved = Resolve-Path $c -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($resolved -and (Test-Path (Join-Path $resolved.Path 'bin\javac.exe'))) { $jdk = $resolved.Path; break }
}
if (-not $jdk) { throw "JDK 17 not found. Install Temurin JDK 17 to $env:LOCALAPPDATA\Programs\jdk-17 or set JAVA_HOME." }
$env:JAVA_HOME = $jdk
$env:Path = "$jdk\bin;$env:Path"
Ok $jdk

# 2. Locate Android SDK
Step 'Android SDK'
$sdk = $env:ANDROID_HOME
if (-not $sdk -or -not (Test-Path $sdk)) { $sdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
if (-not (Test-Path $sdk)) { throw "Android SDK not found at $sdk." }
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
Ok $sdk

# 3. Copy latest glassnote.html (+ vendor/ if present) into android assets
Step 'Copying glassnote.html into android/app/src/main/assets/index.html'
$assetsDir = Join-Path $PSScriptRoot 'android\app\src\main\assets'
New-Item -ItemType Directory -Force -Path $assetsDir | Out-Null
Copy-Item (Join-Path $PSScriptRoot 'glassnote.html') (Join-Path $assetsDir 'index.html') -Force
$vendorSrc = Join-Path $PSScriptRoot 'vendor'
if (Test-Path $vendorSrc) { Copy-Item $vendorSrc (Join-Path $assetsDir 'vendor') -Recurse -Force }
Ok 'copied'

# 4. Build APK with Gradle
Step 'Building APK (first build downloads Gradle & AndroidX deps)'
Push-Location (Join-Path $PSScriptRoot 'android')
try {
  .\gradlew.bat assembleDebug --no-daemon
  if ($LASTEXITCODE) { throw 'Gradle build failed' }
} finally {
  Pop-Location
}

# 5. Collect output
Step 'Collecting output'
$apkSrc = Join-Path $PSScriptRoot 'android\app\build\outputs\apk\debug\app-debug.apk'
$relDir = Join-Path $PSScriptRoot 'release'
New-Item -ItemType Directory -Force -Path $relDir | Out-Null
$apkOut = Join-Path $relDir 'Glassnote.apk'
Copy-Item $apkSrc $apkOut -Force
Ok $apkOut

if ($Install) {
  Step 'Installing to connected Android device'
  $adb = Join-Path $sdk 'platform-tools\adb.exe'
  & $adb install -r $apkOut
  if ($LASTEXITCODE) { throw 'adb install failed' }
  Ok 'installed'
}
