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
- `/aweille-pousse`: manual PR workflow. Reads `CONTRIBUTING.md`, runs only checks named there, creates branch/commit/PR, queues PR review, then watches CI.
- `/aweille-check-ca`: manual PR review, also queued when `/aweille-pousse` opens PR. Runs ponytail and quality reviews, then posts findings without changing code.
- `code-review-and-quality`: multi-axis code review.
- `frontend-ui-engineering`: accessible production UI work.
- `frontend-design-review`: frontend design and accessibility review.
- OpenAI Codex, default model `gpt-5.6-terra`, low thinking.

## Tracked

- Pi settings, global prompt, and custom extensions
- Shared agent skills
- Exact Pi package versions
- Homebrew requirements

## Add custom extension

```bash
mkdir -p ~/.config/pi-config/pi/agent/extensions
$EDITOR ~/.config/pi-config/pi/agent/extensions/my-extension.ts
```

Run `~/.config/pi-config/bootstrap.sh` once on this machine to create extension link. Pi loads it after `/reload` or restart. Invoke PR workflow with `/aweille-pousse`.

## Not tracked

- `~/.pi/agent/auth.json`
- API keys and shell secrets
- `~/.pi/agent/sessions/`
- downloaded package caches and model catalogs
