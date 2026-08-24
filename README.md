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
- **aweille** (custom extension): PR/MR workflow for GitHub (`gh`) and GitLab (`glab`). Host is detected from `origin`; prompts handle judgment, code runs git/CLI operations.
  - `/aweille-pousse`: reads `CONTRIBUTING.md`, gathers git state, then commits, opens PR/MR, queues review, and watches CI.
  - `/aweille-check-ca`: reviews the open PR/MR (also queued after pousse). Posts findings as a simple comment; never changes code.
  - `/aweille-arrange-ca`: plans fixes from review comments; `/aweille-arrange-ca apply` implements approved items and replies on threads.
  - `/aweille-racont <idea>`: drafts a user story with you, then publishes an approved issue on publish.
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

Run `~/.config/pi-config/bootstrap.sh` once on this machine to create extension link. Pi loads it after `/reload` or restart.

## Not tracked

- `~/.pi/agent/auth.json`
- API keys and shell secrets
- `~/.pi/agent/sessions/`
- downloaded package caches and model catalogs
