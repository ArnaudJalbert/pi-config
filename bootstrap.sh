#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
force=${1:-}

link() {
  local source=$1 target=$2
  mkdir -p "$(dirname "$target")"
  if [[ -e $target && ! -L $target ]]; then
    [[ $force == --force ]] || { printf 'Refusing to replace %s. Re-run with --force.\n' "$target" >&2; exit 1; }
    rm -rf "$target"
  fi
  ln -sfn "$source" "$target"
}

command -v brew >/dev/null || { echo 'Install Homebrew first: https://brew.sh'; exit 1; }
brew bundle --file="$root/Brewfile"
link "$root/pi/agent/settings.json" "$HOME/.pi/agent/settings.json"
link "$root/pi/agent/APPEND_SYSTEM.md" "$HOME/.pi/agent/APPEND_SYSTEM.md"
link "$root/pi/agent/extensions" "$HOME/.pi/agent/extensions"
link "$root/agents/skills" "$HOME/.agents/skills"

pi install npm:pi-web-access@0.24.0
pi install npm:@dietrichgebert/ponytail@4.9.0
pi install npm:pi-caveman@1.0.8
pi install npm:@noice-tech/pi-github-issues@2.0.0
