# Restoring after an outage

How to bring every stack back from backup when the NVMe (the `docker`
share) or the whole NAS is lost. The compose files come from this repo, and
everything else comes from the backups below. The README's
[Rebuilding](../README.md#rebuilding-what-this-repo-doesnt-capture) section
lists the settings that live outside both, such as the Tailscale admin
console and the router.

## Where the backups are

One copy, on the Windows PC in `C:\NAS-backup`, made by
[`scripts/backup-nas.ps1`](../scripts/backup-nas.ps1) from the weekly
scheduled task `NAS backup` (Sundays; if the PC was off, it runs when the PC
is next on). `last-run.json` says when the last run finished and whether it
worked. Inside:

```
current\docker\<stack>\   the docker share as it was: live docker-compose.yaml, .env, data
current\immich\           Immich's upload location (originals + backups\ with DB dumps)
current\jellyfin\         Jellyfin's config folder
current\waypoints\        waypoints' folder on the HDD volume
snapshots\<date>.tgz      the docker share per run, 8 weeks back
```

The copy can be up to a week old, so changes since the last run are lost.
Use `current\` unless the latest run already had the damage in it (a
corrupted database, a bad change), in which case unpack an older snapshot.

The PC copy **contains every secret**: `.env` files, Tailscale node keys,
Pi-hole's password. Treat the folder like a password manager export.

## Order

Some stacks join another stack's Docker network, so that stack has to exist
first:

1. **`tailscale`**: remote access, Pi-hole and the DNS relay. Restoring its
   `lib/` keeps the same node, so the tailnet IP, MagicDNS name, approved
   subnet route and `tailscale serve` ports all come back as they were.
2. **`actual`**, then **`claude-actual-agent`** (joins `actual_default`;
   deployed over SSH, see the README).
3. **`arr`**, **`immich`**, **`home-assistant`**, **`fronds`**,
   **`waypoints`**, **`upsnap`**: independent of each other.
4. **`homepage`**: joins `tailscale_dns_relay`.
5. **`tailscale-share`**: joins the networks of the stacks it proxies.
6. **Jellyfin**, outside this repo.

## Scenario A: the NVMe died, the NAS is fine

The HDDs still hold Jellyfin, the Immich library (with its database
dumps) and waypoints' files, so only the docker share needs restoring.

1. Replace the NVMe and recreate its storage pool and volume in UGOS.
2. Recreate the `docker` shared folder on it and reinstall the Docker app if
   UGOS asks.
3. Copy `C:\NAS-backup\current\docker\*` to the share over SMB.
4. Recreate the Projects in the [order above](#order), as in
   [Recreating a Project](#recreating-a-project).
5. [Restore Immich's database](#immich) from the newest dump in the
   `immich` share's `backups/` on the NAS, which is fresher than the PC's.

## Scenario B: the whole NAS is gone

1. Set up the new NAS: an SSD volume for `docker`, an HDD volume for the
   rest. Recreate the shared folders `docker` (SSD), `immich`, `jellyfin`,
   `waypoints` (HDD).
2. Copy from `C:\NAS-backup\current` over SMB:

   | From | To |
   |---|---|
   | `docker\*` | `\\<nas>\docker\` |
   | `immich\*` | `\\<nas>\immich\` |
   | `jellyfin\*` | `\\<nas>\jellyfin\Config\` |
   | `waypoints\*` | `\\<nas>\waypoints\` |

3. If the volume paths differ from before (`/volume1`, `/volume2`), fix the
   host paths in the `.env` files that name them: `UPLOAD_LOCATION` and
   `DB_DATA_LOCATION` in `immich/.env`, `WAYPOINTS_FILES_DIR` in
   `waypoints/.env`.
4. Recreate the Projects in the [order above](#order).
5. [Restore Immich's database](#immich).
6. Movies and TV aren't backed up. Once Sonarr and Radarr are back, their
   libraries list everything that was there; trigger a search for missing
   items to download them again.
7. If the new NAS has a different LAN IP, update the router's DHCP DNS (it
   points at Pi-hole's macvlan IP, which stays the same if the subnet does)
   and the places that hard-code the NAS's LAN IP.

## Recreating a Project

For each stack, in UGOS's Docker app: create a Project on the restored
folder and paste in the folder's own **`docker-compose.yaml` from the
backup**. That is the exact live version, with personal values filled in.
The repo's `docker-compose.yml` would also work, but it expects a few
`${VAR}`s the live `.env` files don't define (see the README's conventions).

Containers that refuse to start with "permission denied" on their data
folder were usually restored with the wrong owner by the SMB copy. The
linuxserver.io images (arr) fix ownership themselves from `PUID`/`PGID`; for
others, compare the folder's owner with what the image runs as.

## Per-app notes

### Immich

Don't copy back Immich's raw Postgres folder; it isn't backed up, because a
file copy of a running Postgres isn't reliable. Immich writes a database dump
every night to `backups/` in its upload location, and those are kept.

1. Deploy the Project with an **empty** `DB_DATA_LOCATION` folder.
2. Restore the newest `immich-db-backup-*.sql.gz` from `backups/`, following
   Immich's [backup and restore guide](https://immich.app/docs/administration/backup-and-restore)
   for the version in the dump's file name (it needs a shell on the NAS).
3. Thumbnails and transcoded videos weren't backed up either. Run the
   **Generate Thumbnails** and **Transcode Videos** jobs (Administration →
   Jobs) for "missing".

### Home Assistant

The whole `config/` folder comes back, so nothing needs redoing, including
its UI-only HTTP settings. If it's broken anyway, restore one of its own
backups from `config/backups/` during onboarding instead. They're encrypted
with the backup key, which isn't in this backup.

### Sonarr, Radarr, Prowlarr

Their config folders come back whole. If a database is damaged, each app
also keeps its own zipped backups in `config/Backups/`, restorable from
System → Backup.

### Pi-hole

`etc-pihole/` comes back without its query history (`pihole-FTL.db`), which
starts empty. Settings, blocklists and the gravity database are kept.

### Tailscale

If `lib/` (or `tailscale-share`'s `state/`) is lost or the node was removed
from the admin console, it starts as a new machine: log it in, then redo the
admin console steps and the `tailscale serve` commands from the README. The
new tailnet IP has to go into the tailnet DNS setting, the README, the
Homepage links and `dns-relay/dnsmasq.conf`.

### claude-actual-agent

Not in the backup: its folder lives in the NAS user's home directory and is
rebuilt from this repo, and its `config/.env` is a copy of one kept on the
PC. Its Claude login has to be done again (see the README).

## Checking the backup

Once in a while, open `last-run.json` and a recent log in `logs\`, and
spot-check that a recent photo is in `current\immich\upload\` and today's
Immich dump is in `current\immich\backups\`. A real test is restoring one
stack to a spare folder.
