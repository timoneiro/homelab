# Usage notes

## Folder-per-service convention

Every service/stack gets its own folder under `services/`:

```
services/<name>/
  docker-compose.yml
  .env.example   # committed — same keys as .env, placeholder values
  .env           # gitignored — real values
  config/        # non-secret config the service reads (nginx.conf, etc.)
```

`docker-compose.yml` should read secrets via `env_file: .env` (or `${VAR}` substitution) rather than hardcoding them inline, so the compose file itself is safe to commit.

## Before every commit (this repo is public)

Check `git status` — look at every file about to be staged. Anything named `.env`, `secrets.*`, `*.key`, `*.pem`, an SSH private key, a VPN config, or a database dump should NOT be there. The `.gitignore` catches the common cases but new services can introduce new secret filenames.

Check `git diff --staged` — skim the actual content, not just filenames. A "safe" filename can still contain a pasted API key or password inside it.

If something slips through and gets pushed: rotate/revoke that credential immediately (change the password, regenerate the API key/token) — removing it from git history later does not undo the exposure, since it may already be cached or scraped.

## Optional: automated secret scanning

For extra safety on a public repo, consider running [gitleaks](https://github.com/gitleaks/gitleaks) as a pre-commit hook or before pushing:

```bash
gitleaks detect --source . -v
```

This is a recommendation, not something this repo depends on — install it locally on the server if you want the extra check.

## Rebuilding a service from this repo

```bash
cd services/<name>
cp .env.example .env      # then fill in real values
docker compose up -d
```

## Adding a systemd unit, cron job, or other non-Docker config

Same idea — give it a home under `services/<name>/` (or a top-level folder like `systemd/` if it's not really a "service" in the Docker sense) and keep any secret values out of the committed files.
