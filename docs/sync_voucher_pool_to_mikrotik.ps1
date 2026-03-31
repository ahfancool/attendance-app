param(
  [Parameter(Mandatory = $true)]
  [string]$SupabaseUrl,

  [Parameter(Mandatory = $true)]
  [string]$SupabaseServiceKey,

  [Parameter(Mandatory = $true)]
  [string]$MikrotikHost,

  [Parameter(Mandatory = $true)]
  [string]$MikrotikPassword,

  [string]$MikrotikUser = 'admin',
  [string]$MikrotikHostKey = '',
  [string]$HotspotProfile = 'harian',
  [string]$OutputDir = '.'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-PlinkPath {
  $candidates = @(
    'C:\Program Files\PuTTY\plink.exe',
    'plink'
  )
  foreach ($item in $candidates) {
    if (Get-Command $item -ErrorAction SilentlyContinue) {
      return $item
    }
  }
  throw 'plink tidak ditemukan. Install PuTTY dulu.'
}

function Ensure-OutputDir([string]$path) {
  if (-not (Test-Path $path)) {
    New-Item -ItemType Directory -Path $path | Out-Null
  }
}

function Build-RouterComment([string]$source, [string]$status) {
  $safeSource = ($source ?? '').Trim()
  $safeStatus = ($status ?? '').Trim()
  return "wallet-sync $safeSource $safeStatus"
}

Ensure-OutputDir -path $OutputDir

$normalizedUrl = $SupabaseUrl.TrimEnd('/')
$headers = @{
  apikey = $SupabaseServiceKey
  Authorization = "Bearer $SupabaseServiceKey"
}

$poolUri =
  "$normalizedUrl/rest/v1/voucher_pool?select=username,password,status,source&status=in.(available,reserved,sold)&source=not.eq.seed_sql&order=created_at.asc"

$rows = Invoke-RestMethod -Method GET -Uri $poolUri -Headers $headers
$rows = @($rows)

if ($rows.Count -eq 0) {
  Write-Host 'Tidak ada row voucher_pool produksi untuk disinkronkan (sumber non-seed_sql kosong).'
  exit 0
}

$timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$rscPath = Join-Path $OutputDir "sync_pool_to_mikrotik_$timestamp.rsc"

$scriptLines = @(
  "# Auto-generated from voucher_pool (non-seed_sql)",
  ":local added 0",
  ":local updated 0"
)

foreach ($row in $rows) {
  $username = [string]$row.username
  $password = [string]$row.password
  $status = [string]$row.status
  $source = [string]$row.source

  if ([string]::IsNullOrWhiteSpace($username) -or [string]::IsNullOrWhiteSpace($password)) {
    continue
  }

  $username = $username.Replace('"', '')
  $password = $password.Replace('"', '')
  $comment = (Build-RouterComment -source $source -status $status).Replace('"', '')

  $scriptLines += (':local uid [/ip hotspot user find where name="' + $username + '"]')
  $scriptLines += ':if ([:len $uid] = 0) do={'
  $scriptLines += ('  /ip hotspot user add name="' + $username + '" password="' + $password + '" profile="' + $HotspotProfile + '" comment="' + $comment + '"')
  $scriptLines += '  :set added ($added + 1)'
  $scriptLines += '} else={'
  $scriptLines += ('  /ip hotspot user set $uid password="' + $password + '" profile="' + $HotspotProfile + '" comment="' + $comment + '"')
  $scriptLines += '  :set updated ($updated + 1)'
  $scriptLines += '}'
}

$scriptLines += ':put ("sync done | added=" . $added . " updated=" . $updated)'
$scriptLines | Set-Content -Path $rscPath -Encoding ascii

Write-Host "RSC generated: $rscPath"
Write-Host "Rows prepared: $($rows.Count)"

$uploadUrl = "ftp://$MikrotikHost/$([System.IO.Path]::GetFileName($rscPath))"
& curl.exe -s --user "$MikrotikUser`:$MikrotikPassword" -T $rscPath $uploadUrl | Out-Null

$plink = Get-PlinkPath
$cmd = "/import file-name=$([System.IO.Path]::GetFileName($rscPath))"

if ([string]::IsNullOrWhiteSpace($MikrotikHostKey)) {
  & $plink -ssh "$MikrotikUser@$MikrotikHost" -pw $MikrotikPassword -batch $cmd
} else {
  & $plink -ssh "$MikrotikUser@$MikrotikHost" -pw $MikrotikPassword -hostkey $MikrotikHostKey -batch $cmd
}

Write-Host 'Sinkronisasi selesai.'
