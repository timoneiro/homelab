# Usage notes

## Folder-per-service convention

Every service/stack gets its own folder under `services/`:

```
services/<name>/
  docker-compose.yml
  .env.example   # committed — same keys as .env, placeholder values
  .env           # gitignored — real values
  config/        # non-secret config the service reads
```

Compose files get secrets and personal values from `.env`, either through `${VAR}` substitution (Compose auto-loads `.env` from the project folder) or `env_file: .env`. They never contain those values inline, so the compose file itself is safe to commit. A service with nothing to hide needs neither `.env` nor `.env.example`.

- For a non-secret value with a safe fallback, use `${VAR:-default}`, for example `TZ=${TZ:-Etc/UTC}`.
- For a value that must be set, use `${VAR:?message}`. The deploy then fails loudly instead of running with an empty value.

## Syncing changes back from the NAS

The NAS is the source of truth: services are edited in UGOS, then copied here. With the NAS's `docker` share mapped as a drive (`X:` below), diff before copying anything:

```bash
diff -u --strip-trailing-cr services/<name>/docker-compose.yml /x/<name>/docker-compose.yaml
```

UGOS names its copy `docker-compose.yaml`. The repo should differ from the NAS only where values were replaced with `${VAR}` or `{{HOMEPAGE_VAR_*}}`, and any other difference is drift in one direction or the other. Don't copy files over wholesale, because the NAS copies contain real secrets and personal values.

## Before every commit (this repo is public)

Check `git status`, looking at every file about to be staged. Anything named `.env`, `secrets.*`, `*.key` or `*.pem` should not be there, and neither should an SSH private key, a VPN config, a database dump, or an app's state folder. The `.gitignore` catches the common cases, but new services can introduce new file names.

Check `git diff --staged`, skimming the actual content and not just the file names. A "safe" file name can still contain a pasted API key or password. Look for personal details too, not just credentials: a timezone, the tailnet name (`*.ts.net`), device hostnames, real names and email addresses.

Commit with your GitHub noreply address (`git config user.email <id>+<username>@users.noreply.github.com` in this repo), because author emails are public in the history.

If something slips through and gets pushed, rotate or revoke that credential immediately by changing the password or regenerating the API key or token. Removing it from git history later does not undo the exposure, since it may already be cached or scraped.

## Optional: automated secret scanning

For an extra check, run [gitleaks](https://github.com/gitleaks/gitleaks) as a pre-commit hook or before pushing:

```bash
gitleaks detect --source . -v
```

This is a recommendation, not something this repo depends on. It looks for credentials, not personal details, so the manual diff check above still matters.

## Adding a systemd unit, cron job, or other non-Docker config

Same idea: give it a home under `services/<name>/`, or under a top-level folder like `systemd/` if it isn't really a Docker service, and keep any secret or personal values out of the committed files.
