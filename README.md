# pi-config

Portable Pi configuration. Secrets and session history stay local.

## Install on a new Mac

```bash
git clone git@github.com:ArnaudJalbert/pi-config.git ~/.config/pi-config
~/.config/pi-config/bootstrap.sh
```

`bootstrap.sh --force` replaces existing Pi config and shared skills with this repo's links.

## What this setup uses

- `pi-web-access`: web search and page-content tools.
- `ponytail`: favors smallest working code change.
- `pi-caveman`: terse agent responses.
- `pi-github-issues`: GitHub issue tooling.
- `code-review-and-quality`: multi-axis code review.
- `frontend-ui-engineering`: accessible production UI work.
- `frontend-design-review`: frontend design and accessibility review.
- OpenAI Codex, default model `gpt-5.6-terra`, low thinking.

## Tracked

- Pi settings and global prompt
- Shared agent skills
- Exact Pi package versions
- Homebrew requirements

## Not tracked

- `~/.pi/agent/auth.json`
- API keys and shell secrets
- `~/.pi/agent/sessions/`
- downloaded package caches and model catalogs
