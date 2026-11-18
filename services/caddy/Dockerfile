# Caddy with the Cloudflare DNS plugin, so it can get a wildcard certificate
# for *.home.timoneiro.app through the DNS challenge. The NAS is reachable
# only over Tailscale, so Let's Encrypt can never reach it over HTTP; proving
# ownership through a DNS record is the only way to get a real certificate.
#
# Built by .github/workflows/caddy-image.yml and published as
# ghcr.io/timoneiro/caddy-cloudflare, so UGOS only has to pull an image.
FROM caddy:2-builder AS builder
RUN xcaddy build --with github.com/caddy-dns/cloudflare

FROM caddy:2
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
