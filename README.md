# homelab

Docker Compose stacks for my home server, version-controlled so changes are
tracked and the setup can be rebuilt from scratch if a machine dies. Runs on
a Ugreen NAS (UGOS), deployed through its Docker GUI app rather than
SSH/CLI — see [Deploying on a GUI-only NAS](#deploying-on-a-gui-only-nas)
for what that changes about how these compose files are written.

## What's included

| Service | What it is | Notable pieces |
|---|---|---|
| [`arr`](services/arr/) | Media automation stack | Prowlarr, Sonarr, Radarr, Bazarr, qBittorrent, Seerr (request management), Unpackerr |
| [`immich`](services/immich/) | Self-hosted photo/video backup | Stock upstream compose file, unmodified |
| [`homepage`](services/homepage/) | Dashboard for everything else | Live-stats widgets for most services below |
| [`tailscale`](services/tailscale/) | VPN mesh + subnet router + ad-blocking DNS | Tailscale, Pi-hole, and a small DNS relay — see the [deep dive](#deep-dive-pi-hole--tailscale-on-a-macvlan-nas) |

Jellyfin runs on this NAS too but isn't in this repo — it's deployed
straight through UGOS outside of git. The `arr` stack and Homepage both
reference it, going through `host.docker.internal` rather than a Docker
service name (see [the hairpin NAT gotcha](#gotcha-containers-cant-reach-the-hosts-own-lan-ip)).

## Repo structure

```
homelab/
├── services/           # one folder per service/stack
│   └── <service>/
│       ├── docker-compose.yml
│       ├── .env.example   # template, committed — placeholder values only
│       ├── .env            # real values, NEVER committed (gitignored)
│       └── config/         # any non-secret config files the service needs
├── docs/                # USAGE.md (secret-scrubbing checklist) and this file's backing notes
└── .gitignore
```

## Getting started

1. `cd services/<name>`
2. `cp .env.example .env`, then fill in real values (API keys, passwords,
   storage paths — whatever that service's `.env.example` calls out).
3. Deploy. If you're on a GUI-only NAS like this repo assumes, paste the
   compose file into your NAS's Docker/Project UI rather than running
   `docker compose up -d` over SSH — see below for why that distinction
   matters more than it sounds like it should.

## Adding a new service

1. `mkdir -p services/<name>`
2. Drop in `docker-compose.yml` and any config files it needs.
3. Secrets go in `services/<name>/.env` (gitignored); a scrubbed copy with
   placeholder values goes in `services/<name>/.env.example` (committed).
   Reference the env file from the compose file with `env_file: .env`
   rather than hardcoding values inline, so the compose file itself stays
   safe to commit.
4. Run `git status` and `git diff --staged` before every commit — this
   repo is **public**, and it's cheap to accidentally stage a secret. See
   [docs/USAGE.md](docs/USAGE.md) for the full checklist.

## Deploying on a GUI-only NAS

Most Docker tutorials assume shell access: SSH in, edit files, run
`docker compose up -d`. A NAS running a vendor Docker GUI (UGOS here, but
Synology/QNAP equivalents behave similarly) breaks that assumption in a way
that's easy to not notice until it costs you a debugging session:

**The GUI's "Project" system usually doesn't read the compose file live off
disk.** It stores its own copy of the compose content internally, and
*rewrites the on-disk file from that stored copy every time you redeploy*.
A direct edit to the file over a network share can look like it worked —
the file genuinely changes — but gets silently clobbered the next time you
redeploy from the GUI. Compose-level changes have to go through the GUI's
own project editor to actually stick. Config files the compose *references*
(a mounted `dnsmasq.conf`, a `services.yaml`) don't have this problem —
only the compose file itself does, since only that one is something the
GUI considers "its own."

Practical fallout for how these compose files are written:
- Prefer `pull_policy: always` over instructions that assume you'll run
  `docker compose pull` manually — there's no CLI to run it from.
- If a step genuinely needs a shell, most of these GUIs offer a
  per-container console button. That's real but limited: it's a shell
  *inside a container*, not the host. A container on `network_mode: host`
  is a useful trick here — a shell in it sees the host's actual network
  interfaces (`ip -br addr`), which is how you find out what a NAS's own
  friendly interface labels ("VBR-LAN1", say) actually resolve to at the
  kernel level, without host SSH at all.
- That console's shell picker may default to `/bin/bash`, which doesn't
  exist on Alpine-based images. Use `/bin/sh` there instead.

## Known limitations / open items

- **Pi-hole's admin UI (port 80) is LAN-only**, even though its DNS
  service (port 53) now works tailnet-wide. The DNS relay described below
  only proxies port 53; extending it to HTTP would need a second relay or
  a reverse proxy. Low priority — the DNS blocking itself is what matters
  day to day, the admin UI is an occasional-use dashboard.
- **IPv6 can silently bypass Pi-hole on a per-device basis.** Routers
  commonly advertise themselves as a DNS server over IPv6 (via Router
  Advertisements/SLAAC, a mechanism separate from DHCP) in addition to
  whatever they hand out over IPv4 DHCP. Many OSes — Windows reliably,
  in testing — prefer that IPv6 DNS server over the IPv4 one, which means
  Pi-hole's IPv4-only DHCP DNS setting gets silently ignored on those
  devices. Not fixed LAN-wide here; the options are disabling IPv6 on the
  router entirely, giving Pi-hole an IPv6 address too and pointing the
  router's RA at it, or (what was actually done) disabling IPv6 per
  affected device. See `ipconfig /all` (Windows) — if `DNS Servers` shows
  something like `fe80::1` instead of your Pi-hole's address, this is why.
- **Browsers with Secure DNS/DoH enabled bypass all of this network-level
  DNS configuration entirely**, sending queries encrypted straight to
  Cloudflare or Google regardless of what the OS or router say. Not a bug
  in this setup — just something to know before concluding Pi-hole "isn't
  working" when a specific browser was actually never asking it in the
  first place.

## Deep dive: Pi-hole + Tailscale on a macvlan NAS

This is the most involved thing in the repo, and the shape of the final
setup only makes sense in light of several constraints that weren't
obvious going in. Worth reading in full if you're trying to replicate
network-wide DNS ad-blocking + VPN-wide reach on a similar NAS, since each
individual piece is a real, non-obvious blocker rather than a style
choice.

**The starting goal**: run Pi-hole so it's usable both as the LAN's DNS
server (via router DHCP) and as the Tailscale tailnet's DNS server (so
ad-blocking follows your devices when you're away from home too).

**Constraint 1 — the NAS's own OS already owns port 53.** Most Docker
Pi-hole tutorials assume `network_mode: host` (or, if Tailscale is also
present, sharing its network namespace via `network_mode:
service:tailscale`) so Pi-hole binds port 53 directly on the host's real
IP. On this NAS, the host's own resolver already holds `0.0.0.0:53` and
`127.0.0.1:53` (confirmed by running `netstat`/`ss` inside a
host-networked container — a NAS's own DNS/mDNS/LLMNR stack commonly does
this). Host networking for Pi-hole is a non-starter here.

**The fix**: give Pi-hole its own real IP on the LAN via a **macvlan**
network instead — it gets a genuine, separate address (not a NAT'd
container IP), so it can bind port 53 without competing with the host at
all. The macvlan's parent has to be the actual kernel network interface
name, which a NAS GUI's friendly label doesn't necessarily match — found
via `ip -br addr` in a host-networked container's console, matching by
which interface carries the NAS's known LAN IP.

If your NAS's own network-creation wizard rejects the real LAN gateway
as a macvlan gateway (a "conflict" that doesn't actually make sense, since
sharing the host's real gateway is exactly what every macvlan setup does)
— that's a GUI validation bug, not a real conflict. Define the macvlan
network directly in the compose file's top-level `networks:` block
instead of using the wizard; the Docker engine underneath has no problem
with it.

**Constraint 2 — macvlan has a host-isolation limitation.** This is
standard, documented Docker behavior, confirmed here rather than just
theoretical: the machine that *hosts* a macvlan network's parent interface
cannot itself reach a macvlan child's IP. This isn't limited to genuinely
host-networked processes — it blocks *any* traffic that has to transit
the host's own network stack to reach the macvlan child, which includes
regular bridge-networked containers too (hit this a second time with a
dashboard's server-side widget call to Pi-hole, not just with Tailscale).
Concretely: LAN devices reach Pi-hole's macvlan IP fine; the NAS itself,
anything sharing its network namespace, and any other container routing
through the host's stack, cannot.

That directly breaks tailnet reachability: Tailscale subnet-routes traffic
by having the NAS forward it, and forwarding *is* traffic transiting the
host's stack.

**The fix**: don't fight the isolation — route around it. A small DNS
relay (a `dnsmasq` container) runs on `network_mode: host`, listening
*only* on the NAS's Tailscale IP specifically (not the wildcard address,
to avoid re-triggering constraint 1) and forwarding whatever it receives
to Pi-hole over a *second*, plain **bridge** network — bridge networking,
unlike macvlan, doesn't have this host-isolation problem, so the relay
can reach Pi-hole over it just fine. The same trick applies to any other
container that needs to reach Pi-hole's stats/API but can't reach its
macvlan IP: attach it to that same bridge network and call Pi-hole there
instead (used for Homepage's live-stats widget, referencing the network
as `external: true` since it's defined in a different compose project).

**Constraint 3 — Tailscale's own default networking mode gets in the way
too.** The official `tailscale/tailscale` image defaults to *userspace
networking* — its own internal network stack, not a real kernel network
interface — even with `/dev/net/tun` mounted and the container running
privileged. In that mode the tailnet IP is fully functional for
Tailscale's own traffic (routing, subnet routes, ping — all answered by
its userspace stack), but it never becomes a real host-level address, so
anything *else* trying to bind to it directly (like the DNS relay above)
fails, even though the node shows as "online" in the Tailscale admin
console the whole time. Diagnosable via `ps aux | grep tailscaled` in its
console — look for `--tun=userspace-networking` in the launch command.
Fix: set `TS_USERSPACE=false` explicitly.

**End state**: router's DHCP DNS points at Pi-hole's macvlan IP directly
(LAN clients reach it fine — no isolation issue for them); the Tailscale
admin console's DNS nameserver points at the *relay's* IP (the NAS's
Tailscale address), not Pi-hole's macvlan IP directly, since tailnet
clients hit the same isolation problem LAN clients don't.

## Tips

- **Blocklist expectations**: Pi-hole's single default blocklist scores
  meaningfully lower than you might expect against comprehensive
  ad-blocker test tools (~55-60% is normal). DNS-level blocking is
  structurally blind to CNAME-cloaked trackers (served from a subdomain of
  the site itself) and same-origin/inline ads — no blocklist fixes that,
  it's a ceiling inherent to blocking by domain name alone. Adding a few
  more well-curated lists ([firebog.net](https://firebog.net)'s "safe/
  ticked" tier is the standard recommendation) helps some; ~50-75% total
  is a realistic, healthy end state for DNS-only blocking, not a sign of
  misconfiguration. Going further means reaching into riskier/non-ticked
  list tiers, trading a few more blocked domains for real risk of
  false-positives breaking legitimate sites.
- **A phone scoring higher than a PC on the same ad-blocker test** is
  usually not Pi-hole behaving differently per device — it's the phone
  browser's own content-level tracking protection (built into Brave,
  Firefox's Enhanced Tracking Protection, Safari's Intelligent Tracking
  Prevention) stacking on top of the same DNS-level blocking. Check
  whether that's enabled before assuming something's broken on the
  lower-scoring device.
- **After changing any DNS-related config, flush caches before
  re-testing.** Both the OS and the browser cache DNS results
  independently of each other, and a stale cached result from before a
  fix looks identical to the fix not having worked. Windows:
  `ipconfig /flushdns`. Browser: `edge://net-internals/#dns` or
  `chrome://net-internals/#dns` → "Clear host cache".
- **Test infrastructure changes at the smallest useful scope before going
  wide.** Before committing to a router-wide DHCP DNS change, testing via
  a single device's manually-configured DNS (temporary, easily reverted)
  confirms the whole chain works without risking the rest of the network's
  DNS on an untested setup. Same logic applies to Tailscale's admin
  console DNS override — worth confirming raw connectivity to the
  intended nameserver from an actual tailnet client (`nslookup` against
  its IP) before flipping the "override DNS servers" toggle for every
  device on the tailnet at once.

## Gotcha: containers can't reach the host's own LAN IP

A container on this NAS's Docker bridge networking can't reach the host's
own LAN IP, even though every other device on the LAN can — the NAS's
Docker bridge implementation doesn't support NAT hairpinning back to the
host. Symptom: a container-to-host call (e.g. a request-management tool
calling a media server that runs outside this repo's compose files)
times out or connection-refuses, even though the same URL works fine from
a browser on the same network.

Fix: add

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

to the service, and use `host.docker.internal` instead of the host's LAN
IP for any container-to-host call. This is unrelated to the macvlan
host-isolation issue described above (that one blocks host↔macvlan
traffic specifically; this one blocks container-bridge↔host traffic
generally) — the fixes look superficially similar (both are "the host is
unreachable from a container") but address different underlying causes,
and the `host.docker.internal` trick doesn't help with the macvlan case,
just like the macvlan bridge-network workaround doesn't help with this
one.

## This repo is public

No passwords, API keys, tokens, private keys, VPN configs, or internal
network details you care about hiding should ever be committed. When in
doubt, use a placeholder and keep the real value in a local, gitignored
file. See [docs/USAGE.md](docs/USAGE.md) for the full checklist.
