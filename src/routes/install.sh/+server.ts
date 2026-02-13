import type { RequestHandler } from './$types';

const REPO = 'SmileyChris/difflog';

const SCRIPT = `#!/bin/sh
set -eu

REPO="${REPO}"
INSTALL_DIR="\${DIFFLOG_INSTALL_DIR:-/usr/local/bin}"
BINARY_NAME="difflog"

main() {
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m)"

  case "$arch" in
    x86_64|amd64) arch="x64" ;;
    aarch64|arm64) arch="arm64" ;;
    *) err "Unsupported architecture: $arch" ;;
  esac

  case "$os" in
    linux)
      [ "$arch" = "arm64" ] && err "Linux arm64 builds are not yet available"
      asset="difflog-linux-x64"
      ;;
    darwin) asset="difflog-darwin-$arch" ;;
    *) err "Unsupported OS: $os" ;;
  esac

  # Find latest CLI release tag
  tag="$(curl -fsSL "https://api.github.com/repos/$REPO/releases" \\
    | grep -o '"tag_name": *"cli-v[^"]*"' \\
    | head -1 \\
    | cut -d'"' -f4)"

  [ -z "$tag" ] && err "Could not find a CLI release"

  url="https://github.com/$REPO/releases/download/$tag/$asset"
  version="\${tag#cli-v}"

  info "Installing difflog v$version ($os/$arch)"
  info "Downloading $url"

  tmp="$(mktemp)"
  trap 'rm -f "$tmp"' EXIT

  curl -fsSL -o "$tmp" "$url"
  chmod +x "$tmp"

  if [ -w "$INSTALL_DIR" ]; then
    mv "$tmp" "$INSTALL_DIR/$BINARY_NAME"
  else
    info "Writing to $INSTALL_DIR requires sudo"
    sudo mv "$tmp" "$INSTALL_DIR/$BINARY_NAME"
  fi

  info "Installed to $INSTALL_DIR/$BINARY_NAME"

  if ! echo "$PATH" | tr ':' '\\n' | grep -qx "$INSTALL_DIR"; then
    warn "$INSTALL_DIR is not in your PATH"
    warn "Add it with: export PATH=\\"$INSTALL_DIR:\\$PATH\\""
  fi

  info "Run 'difflog --help' to get started"
}

info() { printf '  \\033[32m%s\\033[0m\\n' "$*"; }
warn() { printf '  \\033[33m%s\\033[0m\\n' "$*" >&2; }
err()  { printf '  \\033[31merror: %s\\033[0m\\n' "$*" >&2; exit 1; }

main
`;

export const GET: RequestHandler = async () => {
	return new Response(SCRIPT, {
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
			'Cache-Control': 'public, max-age=300'
		}
	});
};
