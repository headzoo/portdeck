# Portdeck

Local developer utility for discovering services, ports, and exposure risks on your machine.

## Features

- Discover listening TCP ports on Linux via `ss` (with `lsof` fallback)
- Identify owning process name and PID when available
- Lightweight HTTP/HTTPS probing for local URLs
- Heuristic service type classification
- Risk assessment for exposed services
- Label and group services into projects
- Ignore unwanted services
- SQLite persistence for metadata

## Requirements

- Node.js 18+
- pnpm
- Linux (full support); macOS/Windows placeholders included

## Development

```bash
pnpm install
pnpm dev
```

The dev script disables the Chromium sandbox on Linux (`NO_SANDBOX=1`), which avoids the common `chrome-sandbox` SUID error in local development environments.

If Electron fails with "Electron uninstall" after install, re-run:

```bash
node node_modules/electron/install.js
```

## Scripts

- `pnpm dev` — start Electron with HMR
- `pnpm build` — production build
- `pnpm typecheck` — TypeScript check
- `pnpm lint` — ESLint
- `pnpm package` — build distributable (outputs to `dist/`)

## Linux install

After `pnpm package`:

- **AppImage**: `./dist/Portdeck-0.1.0.AppImage`
- **deb**: `sudo dpkg -i dist/portdeck_0.1.0_amd64.deb`

Linux packages launch with `--no-sandbox` because the Chromium SUID sandbox is often misconfigured on installed `.deb` paths (e.g. `/opt/Portdeck/chrome-sandbox`). Do **not** run Portdeck with `sudo`.

The `.deb` post-install script installs a `/usr/bin/portdeck` wrapper that passes `--no-sandbox`. If `portdeck` still fails from the terminal, run directly:

```bash
/opt/Portdeck/portdeck --no-sandbox
```

Or create the wrapper yourself:

```bash
printf '%s\n' '#!/bin/sh' 'exec /opt/Portdeck/portdeck --no-sandbox "$@"' | sudo tee /usr/bin/portdeck
sudo chmod 755 /usr/bin/portdeck
```

## Privileged process attribution

When run as a normal user, the kernel hides the owning PID/process for sockets
owned by other users (e.g. root-owned services on ports 80/443). Portdeck
attributes what it can without elevation, then attempts an elevated `ss` to fill
in the rest:

1. Unprivileged `ss`/`lsof` scan
2. `/proc` socket-ownership resolution (for processes you can inspect)
3. Elevated `ss` enrichment for the remainder:
   - Tries passwordless `sudo -n ss` first (silent, never prompts)
   - Falls back to `pkexec` (GUI password prompt) only when
     `PORTDECK_PRIVILEGED_SCAN=1` is set

Enable the interactive prompt:

```bash
PORTDECK_PRIVILEGED_SCAN=1 pnpm dev
```

If elevation isn't available or is cancelled, Portdeck still lists the ports;
it just shows `—` for the unattributable PID/process. Do **not** run the whole
app as root.

## Breaking changes from Portlight

- Env vars: `PORTLIGHT_PRIVILEGED_SCAN` / `PORTLIGHT_ENABLE_GPU` are now
  `PORTDECK_PRIVILEGED_SCAN` / `PORTDECK_ENABLE_GPU`
- Installed `.deb` is a separate package; uninstall Portlight before or after
  installing Portdeck
- Linux CLI wrapper: `portlight` → `portdeck`
- On first launch, Portdeck copies `portlight.db` and `window-state.json` from
  legacy Portlight config dirs if present

## Architecture

- **Main process**: port scanning, HTTP probing, classification, risk engine, SQLite
- **Preload**: typed IPC bridge (`window.portdeck`)
- **Renderer**: React UI with secure defaults (no Node integration)

## Assumptions

- Stable service keys use `processName:port` when process name is known
- HTTP probes use a 750ms timeout against `127.0.0.1`
- macOS/Windows scanners return empty results with a helpful message until implemented
