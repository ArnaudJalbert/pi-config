# pi-config

Portable Pi configuration. Secrets and session history stay local.

## Install on a new Mac

```bash
git clone git@github.com:ArnaudJalbert/pi-config.git ~/.config/pi-config
~/.config/pi-config/bootstrap.sh
```

`bootstrap.sh --force` replaces existing Pi config and shared skills with this repo's links.

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
