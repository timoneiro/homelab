<#
.SYNOPSIS
Pulls a backup of the NAS's Docker stacks to this PC, so everything can be
redeployed if the NAS or its NVMe dies. Restore steps: docs/RESTORE.md.

.DESCRIPTION
Copies over SMB into <Destination>:

  current\docker     mirror of the docker share: compose files, .env files,
                     every stack's data/config folder
  current\immich     Immich's upload location: originals (never deleted
                     here, so a photo deleted by mistake on the NAS survives)
                     plus Immich's own nightly database dumps
  current\jellyfin   Jellyfin's config (users, watch history, metadata)
  current\waypoints  waypoints' folder on the HDD volume
  snapshots\         a dated .tgz of current\docker per run, so a bad change
                     on the NAS doesn't overwrite the only good copy
  logs\              one robocopy log per run
  last-run.json      when the last run finished and whether it worked

Left out because they regenerate on their own: Immich thumbnails and
transcodes, Immich's raw Postgres folder (restored from its dumps instead),
Sonarr/Radarr poster caches, Pi-hole's query log, logs.

Databases are copied as files while running. Where an app makes its own
consistent dumps (Immich, Home Assistant, Sonarr/Radarr/Prowlarr), those are
what to restore from; the small SQLite/JSON stores (Actual, fronds,
waypoints) are rarely written at night.

Runs from a Windows scheduled task as the logged-on user (that's whose SMB
credentials reach the NAS). On failure it shows a message box.

.EXAMPLE
.\backup-nas.ps1 -Nas MYNAS
#>
param(
    [Parameter(Mandatory)][string]$Nas,
    [string]$Destination = 'C:\NAS-backup',
    # Immich's UPLOAD_LOCATION as seen over SMB
    [string]$ImmichPath = "\\$Nas\immich",
    [string]$JellyfinConfigPath = "\\$Nas\jellyfin\Config",
    [string]$WaypointsPath = "\\$Nas\waypoints",
    [int]$KeepSnapshots = 8,
    [int]$KeepLogs = 30,
    # No message box on failure (for manual runs)
    [switch]$Quiet
)

$stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
$current = Join-Path $Destination 'current'
$logDir = Join-Path $Destination 'logs'
$snapDir = Join-Path $Destination 'snapshots'
$log = Join-Path $logDir "$stamp.log"
New-Item -ItemType Directory -Force $current, $logDir, $snapDir | Out-Null

$failures = @()

function Write-Log([string]$msg) {
    $line = "[{0:HH:mm:ss}] {1}" -f (Get-Date), $msg
    Write-Host $line
    Add-Content -LiteralPath $log -Value $line -Encoding Unicode
}

# /J: unbuffered reads. Windows' SMB client can keep serving a cached copy
# of a file that a container changed on the NAS; unbuffered I/O skips that
# cache. Exit codes 0-7 are success, 8+ means some files failed.
function Copy-Tree([string]$src, [string]$dst, [string[]]$extra) {
    if (-not (Test-Path -LiteralPath $src)) {
        $script:failures += "missing source $src"
        Write-Log "MISSING $src"
        return
    }
    Write-Log "copy $src -> $dst"
    $rcArgs = @($src, $dst, '/R:2', '/W:5', '/J', '/MT:8', '/XJ', '/NP', '/NDL', '/NFL',
        '/XF', '*.log', "/UNILOG+:$log") + $extra
    & robocopy.exe @rcArgs | Out-Null
    if ($LASTEXITCODE -ge 8) {
        $script:failures += "robocopy exit $LASTEXITCODE for $src"
        Write-Log "FAILED $src (robocopy exit $LASTEXITCODE)"
    }
}

Write-Log "backup of \\$Nas to $Destination"

$docker = "\\$Nas\docker"
Copy-Tree $docker (Join-Path $current 'docker') @(
    '/MIR',
    # album: Immich's library before it moved to its own share on the HDDs
    '/XD', "$docker\immich\album", "$docker\immich\postgres", 'MediaCover', 'logs',
    # ipc-socket: qBittorrent's Unix socket, which can't be read over SMB
    '/XF', 'pihole-FTL.db*', 'gravity_old.db', 'ipc-socket')

# Originals: copy, never purge
foreach ($d in 'upload', 'library', 'profile') {
    if (Test-Path -LiteralPath "$ImmichPath\$d") {
        Copy-Tree "$ImmichPath\$d" (Join-Path $current "immich\$d") @('/E')
    }
}
Copy-Tree "$ImmichPath\backups" (Join-Path $current 'immich\backups') @('/MIR')

Copy-Tree $JellyfinConfigPath (Join-Path $current 'jellyfin') @(
    '/MIR', '/XD', 'cache', '.cache', 'log', 'transcodes')

# waypoints' trip documents, photos and daily database copies: never purge
Copy-Tree $WaypointsPath (Join-Path $current 'waypoints') @('/E')

# Snapshot the docker share (small: app data and secrets). Leaves out what is
# already versioned elsewhere: Home Assistant's own backups.
$snap = Join-Path $snapDir "$stamp.tgz"
Write-Log "snapshot $snap"
& tar.exe -czf $snap -C (Join-Path $current 'docker') `
    --exclude 'home-assistant/config/backups' .
if ($LASTEXITCODE -ne 0) {
    $failures += "tar exit $LASTEXITCODE"
    Write-Log "FAILED snapshot (tar exit $LASTEXITCODE)"
}

Get-ChildItem $snapDir -Filter *.tgz | Sort-Object Name -Descending |
    Select-Object -Skip $KeepSnapshots | Remove-Item
Get-ChildItem $logDir -Filter *.log | Sort-Object Name -Descending |
    Select-Object -Skip $KeepLogs | Remove-Item

$ok = $failures.Count -eq 0
[pscustomobject]@{
    finished = (Get-Date).ToString('s')
    ok       = $ok
    failures = $failures
    log      = $log
} | ConvertTo-Json | Set-Content -Encoding utf8 (Join-Path $Destination 'last-run.json')
Write-Log ($(if ($ok) { 'done' } else { "done with failures: $($failures -join '; ')" }))

if (-not $ok) {
    if (-not $Quiet) {
        (New-Object -ComObject WScript.Shell).Popup(
            "NAS backup failed:`n$($failures -join "`n")`n`nLog: $log", 0, 'NAS backup', 0x10) | Out-Null
    }
    exit 1
}
