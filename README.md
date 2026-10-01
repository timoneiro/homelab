# homelab

Docker Compose stacks for a Ugreen NAS running UGOS, kept in git so changes
are tracked and the setup can be rebuilt if the NAS dies. Everything is
deployed through UGOS's Docker GUI rather than over SSH, which shapes how
these files are written (see [Deploying on UGOS](#deploying-on-ugos)).
Remote access is over Tailscale.

## Services

| Folder | What runs there | Web UI port |
|---|---|---|
| [`actual`](services/actual/) | [Actual Budget](https://actualbudget.org), personal finance | 5006 (HTTPS only, [see below](#how-you-reach-things)) |
| [`claude-actual-agent`](services/claude-actual-agent/) | Claude Code session with access to Actual, for logging expenses from a phone over Remote Control ([see below](#claude-actual-agent)) | None |
| [`arr`](services/arr/) | Media automation: Prowlarr, Sonarr, Radarr, Bazarr, qBittorrent, Seerr (requests), Unpackerr (extracts downloaded archives) | 9696, 8989, 7878, 6767, 8080, 5055 |
| [`fronds`](services/fronds/) | Sync and watering-reminder server for [fronds](https://github.com/timoneiro/fronds), a houseplant app hosted on GitHub Pages | 8787 (API only, called over HTTPS) |
| [`homepage`](services/homepage/) | [Homepage](https://gethomepage.dev) dashboard linking everything, with live-stats widgets | 3000 |
| [`immich`](services/immich/) | Photo and video backup, using Immich's upstream compose file unmodified | 2283 |
| [`tailscale`](services/tailscale/) | Tailscale subnet router, Pi-hole, and a DNS relay that makes Pi-hole work tailnet-wide | Pi-hole: 80 (LAN only) |
| [`upsnap`](services/upsnap/) | [UpSnap](https://github.com/seriousm4x/UpSnap), a Wake-on-LAN dashboard for waking a gaming PC remotely | 8090 |

Jellyfin (port 8096) also runs on the NAS but isn't in this repo; it's
deployed directly through UGOS.

## How you reach things

**Plain HTTP on the NAS's tailnet IP** (`http://<tailnet-ip>:<port>`) is the
default, and it's what Homepage links to. It works from anywhere on the
tailnet, where the NAS's LAN IP only works at home.

**HTTPS via `tailscale serve`** fronts the services that need a secure
context, using a real certificate for the NAS's MagicDNS name
(`https://<node>.<tailnet>.ts.net:<port>`):

| HTTPS port | Backend | Why it needs HTTPS |
|---|---|---|
| 443 | Seerr (5055) | "Install app" (PWA) and web push notifications |
| 8443 | Homepage (3000) | "Install app" (PWA) |
| 9443 | Actual (5006) | Won't load at all otherwise: it needs `SharedArrayBuffer`, which browsers only expose in a secure context. Use this URL even at home. |
| 10443 | fronds (8787) | The app is served from `https://timoneiro.github.io`, and an HTTPS page can only call an HTTPS server. |

This isn't in any compose file; it lives in tailscaled's own state. Enable
**HTTPS Certificates** in the Tailscale admin console (DNS page), then run
this in the `tailscale` container's console (shell: `/bin/sh`):

```sh
tailscale serve --https=443  --bg localhost:5055
tailscale serve --https=8443 --bg localhost:3000
tailscale serve --https=9443 --bg localhost:5006
tailscale serve --https=10443 --bg localhost:8787
tailscale serve status   # shows what's configured
```

`localhost` reaches the other containers because the `tailscale` container
uses the host's network. Homepage also needs its `ts.net` host:port listed
in `HOMEPAGE_ALLOWED_HOSTS`, or Next.js rejects the request with "Host
validation failed".

**DNS**: LAN devices use Pi-hole through the router, tailnet devices through
the NAS's tailnet IP. That second path is the most involved part of this
repo; see [Pi-hole + Tailscale DNS](#pi-hole--tailscale-dns).

## Deploying on UGOS

UGOS's Docker app runs Compose "Projects", each tied to a folder on the
NAS's `docker` share. To deploy a service from this repo:

1. Create `<name>/` on the `docker` share (over SMB is fine) and copy in
   everything the compose file mounts: `config/`, `dns-relay/`, and so on.
2. If the service has a `.env.example`, copy it there as `.env` and fill in
   the real values.
3. In UGOS's Docker app, create a Project on that folder and paste in the
   contents of `docker-compose.yml`. UGOS saves its own copy as
   `docker-compose.yaml`.

**Edit compose files in UGOS, not over SMB.** UGOS doesn't read the compose
file from disk. It keeps its own copy and rewrites the file from it on
every redeploy, so an SMB edit looks like it worked and is silently undone
next time. Files the compose file *references* (`.env`, `config/*.yaml`,
`dnsmasq.conf`) are read from disk and can be edited over SMB; `.env`
changes take effect on the next redeploy.

**The NAS is the source of truth; this repo is a copy.** After changing
something in UGOS, bring it back here, replacing secrets and personal
values with variables on the way. [docs/USAGE.md](docs/USAGE.md#syncing-changes-back-from-the-nas)
has the diff command.

Being GUI-only changes a few habits:

- Use `pull_policy: always` on images you want kept current. There's no CLI
  to run `docker compose pull` from, and with this set, a redeploy pulls.
- For a shell, use the container's **Console** button in UGOS. Its shell
  picker defaults to `/bin/bash`, which doesn't exist on Alpine-based
  images such as `tailscale/tailscale`; pick `/bin/sh` there.
- A console on a `network_mode: host` container sees the host's real
  network stack (`ip -br addr`, `netstat -tulpn`). That's how the host-level
  facts below were found without SSH access to the NAS.

## Rebuilding: what this repo doesn't capture

The compose files recreate the containers, not their data or the settings
that live elsewhere. A rebuild also needs:

- **`.env` files.** These hold the real secrets and exist nowhere else, so
  keep a copy somewhere safe, such as a password manager.
- **App data.** Back these up separately; they're gitignored here: the arr
  apps' config folders, Immich's library and Postgres data, Actual's
  `data/`, fronds' `data/` (which also holds its generated household and
  push keys), UpSnap's `data/`, and Pi-hole's `etc-pihole/`.
- **Jellyfin**, which runs as its own container outside this repo.
- **Tailscale admin console settings:**
  - Approve the advertised subnet route, and approve it again after any
    `TS_ROUTES` change.
  - Enable HTTPS Certificates.
  - Set the DNS nameserver to the NAS's tailnet IP (the relay, not
    Pi-hole's LAN IP) with "Override DNS servers" on.
- **`tailscale serve` config**, from the [commands above](#how-you-reach-things).
  It survives container restarts through `./lib/tailscale`, but a fresh node
  starts without it.
- **Tailscale clients**, each of which has to opt in to "Use subnet routes"
  to reach LAN-only addresses.
- **Router**, whose DHCP DNS server has to point at Pi-hole's LAN IP.
- **claude-actual-agent's Claude login**, which lives in its
  `claude-nas-agent-config` volume. Create the volume and log in before the
  first start ([see below](#claude-actual-agent)).
- **Pi-hole blocklists.** Add them under Group Management → Adlists, then
  run Tools → Update Gravity to apply them. Pi-hole's Settings → Teleporter
  exports these and the rest of its config as one backup file.

## claude-actual-agent

A container running `claude remote-control`, so a Claude Code session with
the [actual-budget skill](services/claude-actual-agent/SKILL.md) is always
reachable from the Claude mobile app or claude.ai/code. It joins the
`actual` project's network and talks to the server at `http://actual:5006`.

This is the one service deployed over SSH instead of through UGOS. It's
built from a local Dockerfile, and Claude Code's login needs an interactive
terminal. From the service folder on the NAS:

```sh
cp config/.env.example config/.env    # then fill it in
docker volume create claude-nas-agent-config
docker compose build
docker compose run --rm --entrypoint claude claude-actual-agent   # run /login, then /exit
docker compose up -d
```

**The login expires after about 30 days** and the container then
crash-loops with "You must be logged in to use Remote Control". Remote
Control needs a full claude.ai login, so a long-lived token from
`claude setup-token` or an API key won't work. Log in again with the `run`
command above, then `docker restart claude-actual-agent`.

## Pi-hole + Tailscale DNS

**Goal:** one Pi-hole that filters DNS for the LAN (through the router) and
for every tailnet device wherever it is (through Tailscale's DNS settings).

**End state:**

```
LAN device ──▶ router ──▶ Pi-hole @ macvlan LAN IP

tailnet device ──▶ NAS tailnet IP :53 ──▶ dns-relay ──▶ Pi-hole @ 172.21.0.2
                   (dnsmasq, host network)               (dns_relay bridge)

Homepage's Pi-hole widget ─────────────────────────────▶ Pi-hole @ 172.21.0.2
```

Pi-hole sits on two networks at once. A macvlan network gives it its own
address on the LAN, and a plain bridge network (`dns_relay`) gives the NAS a
way to reach it. Each piece exists because of a specific blocker.

### 1. UGOS already owns port 53

Most Docker Pi-hole guides use `network_mode: host`, or share the Tailscale
container's network. Neither works here, because UGOS's own resolver already
listens on `0.0.0.0:53` and `127.0.0.1:53` on the host.

**Fix: macvlan.** Pi-hole gets its own real LAN IP, so it binds port 53
without competing with the host. Two UGOS-specific snags:

- The macvlan `parent` must be the kernel interface name, not UGOS's label
  for it. "VBR-LAN1" turned out to be `bridge0`. Find yours with
  `ip -br addr` in a host-networked container's console, by looking for the
  interface that carries the NAS's LAN IP.
- UGOS's "Add Network" wizard rejects the real LAN gateway as a macvlan
  gateway with "Gateway IP conflict" (Confirm stays clickable but does
  nothing). A macvlan network needs exactly that gateway, so this is a
  validation bug in UGOS. Define the network in the compose file's
  top-level `networks:` block instead; Docker itself accepts it.

### 2. The host can't reach its own macvlan children

This is standard Docker macvlan behaviour: the host that owns the parent
interface can't talk to macvlan addresses on it. It applies to anything
whose traffic passes through the host's network stack, which here means the
NAS itself, `network_mode: host` containers, ordinary bridge containers,
*and* tailnet traffic forwarded by the subnet router. Only other physical
LAN devices get through, so tailnet clients can't use Pi-hole's macvlan IP.

**Fix: route around it over a bridge network**, which the host *can* reach:

- `dns-relay` (dnsmasq) runs on `network_mode: host` and listens only on
  the NAS's tailnet IP. It can't listen on the wildcard address, since that
  would hit problem 1 again. It forwards everything to Pi-hole's bridge IP,
  `172.21.0.2`.
- Homepage's Pi-hole widget uses the same bridge IP. Homepage joins that
  network as `external: true` under its full name, `tailscale_dns_relay`,
  since it's defined in another compose project. The card's clickable link
  still uses the macvlan IP, because that request comes from your browser
  on the LAN, not from the container.
- Pi-hole needs `FTLCONF_dns_listeningMode=ALL`. By default it ignores
  queries from subnets it doesn't consider local, and that includes the
  tailnet's `100.64.0.0/10`.

### 3. The Tailscale image defaults to userspace networking

Even with `/dev/net/tun` mounted and `privileged: true`, the official
`tailscale/tailscale` image runs tailscaled on its own userspace network
stack unless told otherwise. The node shows as online, and ping and subnet
routing both work. But the tailnet IP never exists as a host interface, so
the relay can't bind to it ("Cannot assign requested address"). To
diagnose, run `ps aux | grep tailscaled` in the container console and look
for `--tun=userspace-networking`. The fix is `TS_USERSPACE=false`.

### 4. The dnsmasq image's entrypoint gets in the way

`tschaffter/dnsmasq`'s entrypoint script causes two problems:

- It expects the full command, including the binary name, so
  `command: -k` alone fails with `exec: -k: invalid option`.
- It appears to drop root before starting dnsmasq, so binding port 53 fails
  with "Permission denied" even with `NET_BIND_SERVICE`.

The compose file skips the script with `entrypoint: ["dnsmasq"]` and
`command: ["-k"]`.

### Rolling it out

Test with one device first. Set its DNS to Pi-hole by hand, confirm
blocking works, and only then change the router's DHCP DNS. Do the same on
the tailnet: run `nslookup example.com <NAS tailnet IP>` from one tailnet
client before setting that IP as the tailnet-wide nameserver.

## Pi-hole: when it seems not to work

All of these came up during rollout, and none was a Pi-hole or router
misconfiguration.

- **The router lists itself as the DNS server.** Many ISP routers hand out
  their own IP over DHCP and relay queries to whatever upstream DNS you
  configure. If `ipconfig` shows the router's IP, that's expected. It doesn't
  mean the change failed to apply.
- **Windows uses the IPv6 DNS server.** Routers also advertise a DNS server
  over IPv6, through Router Advertisements rather than DHCP. It's often
  their own link-local address, such as `fe80::1`. Windows prefers it over
  the IPv4 one, so Pi-hole never sees that PC's queries; check
  `ipconfig /all` to confirm. To fix one PC, go to `ncpa.cpl` → adapter
  Properties and untick "Internet Protocol Version 6". Android preferred
  IPv4 in testing. The LAN-wide fixes (disabling IPv6 on the router, or
  giving Pi-hole an IPv6 address and advertising that) aren't done here.
- **Browsers with Secure DNS (DoH) on skip the OS resolver** and send
  queries straight to Cloudflare or Google. Turn it off per browser.
  Chrome/Edge: Settings → Privacy → Security → "Use secure DNS". Firefox:
  Privacy & Security → DNS over HTTPS.
- **Stale caches make a fix look like it failed.** The OS and the browser
  cache DNS separately, so flush both before retesting: `ipconfig /flushdns`,
  then `chrome://net-internals/#dns` (or `edge://…`) → "Clear host cache".
- **The block rate is lower than you'd expect, and that's normal.** On
  [d3ward's ad-block test](https://d3ward.github.io/toolz/adblock.html),
  Pi-hole's default list scored about 58%. Adding
  [firebog.net](https://firebog.net)'s ticked Advertising and Tracking lists
  only raised that to about 61%. DNS blocking can't see CNAME-cloaked
  trackers or first-party ads, so 50–75% is a realistic ceiling. Firebog's
  unticked lists add a few points at a real risk of breaking sites.
- **A phone that scores higher than a PC** is usually getting help from its
  browser's own tracker blocking (Brave, Firefox ETP, Safari ITP) on top of
  Pi-hole. Pi-hole isn't treating the devices differently.

## Other gotchas

### Containers can't reach the NAS's own LAN IP

UGOS's Docker bridge doesn't do NAT hairpinning. A container calling the
NAS's LAN IP times out, even though the same URL works from every other LAN
device. Add

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

to the service and call `host.docker.internal` instead. Homepage's widgets
and Seerr's connection to Jellyfin both work this way. This is a different
problem from macvlan isolation, and neither fix helps with the other.

### Jellyseerr is now Seerr

`fallenbagel/jellyseerr` is frozen at its last release (2.7.3), and the
project continues as `ghcr.io/seerr-team/seerr`. The new image needs
`init: true` because it no longer bundles an init process. Like the old
image, it ignores `PUID`/`PGID`. The service keeps its old `jellyseerr`
name and config folder.

## Open items

- **Pi-hole's admin UI is LAN-only**, because the relay forwards only DNS.
  One untested idea is `tailscale serve --https=<port> --bg http://172.21.0.2:80`.
  It should work for the same reason the DNS relay does: tailscaled runs on
  the host network, and the host can reach the bridge IP.
- **Apollo's web UI** (game streaming host on the gaming PC) only accepts
  LAN connections by default, so its Homepage link only works at home.
- **IPv6 DNS bypass** is only fixed per device (see above).

## Repo layout and conventions

```
services/<name>/
├── docker-compose.yml   # what gets pasted into UGOS
├── .env.example         # committed, placeholder values (only if the service uses env vars)
├── .env                 # real values: gitignored, lives on the NAS
└── config/, …           # non-secret files the compose file mounts
docs/USAGE.md            # commit checklist and syncing from the NAS
```

This repo is public, so it holds no secrets and no personal details. Values
like the timezone, tailnet name and device names go through `${VAR}` in
compose files or `{{HOMEPAGE_VAR_*}}` in Homepage's config, with the real
values in `.env`. Read [docs/USAGE.md](docs/USAGE.md) before committing.
