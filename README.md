<!-- Copyright 2014 Signal Messenger, LLC -->
<!-- SPDX-License-Identifier: AGPL-3.0-only -->

# Signal Desktop

[![Build](https://github.com/serphen/Signal/actions/workflows/build-macos.yml/badge.svg)](https://github.com/serphen/Signal/actions/workflows/build-macos.yml) [![Release date](https://img.shields.io/github/release-date/serphen/Signal)](https://github.com/serphen/Signal/releases/latest)

## Install (macOS Apple Silicon)

```bash
curl -fSL \
  https://github.com/serphen/Signal/releases/latest/download/Signal.tar.gz \
  | tar xz -C /Applications/ Signal.app
```

If macOS says the app is "damaged" or "can't be opened", run:
```bash
xattr -cr /Applications/Signal.app
```

---

## Build

The easiest way to build is with the devcontainer. Everything is pre-installed and isolated — just clone, open, and build. A native build option (without Docker) is available at the bottom.

## Quick start (recommended)

1. Install [OrbStack](https://orbstack.dev/) and [VS Code](https://code.visualstudio.com/) with the **Dev Containers** extension
2. Clone the repo
```bash
git clone https://github.com/serphen/Signal.git
```
3. Open the `Signal` folder in VS Code, then `Cmd+Shift+P` > **Dev Containers: Reopen in Container**
4. Build:
```bash
./scripts/build.sh
```

That's it. The macOS `.app` (Apple Silicon) lands in `dist/mac-arm64/Signal.app`.

Other platforms:
```bash
./scripts/build.sh mac x64      # macOS Intel
./scripts/build.sh linux        # Linux
./scripts/build.sh windows      # Windows (x86_64 host only, needs Wine)
```

You can also use it for dev — just rebuild and relaunch the app after each change.

## Tips

- **DevTools (Inspect Element):** `Cmd+Option+I`

---

<details>
<summary>Alternative: native build (no Docker)</summary>

Build directly on the host. Useful if you want hot reload via `pnpm start` for faster iteration.

```bash
git clone https://github.com/serphen/Signal.git
cd Signal
nvm install && nvm use
npm install -g pnpm
pnpm install && pnpm rebuild
```

Dev mode (live reload):
```bash
pnpm run generate
pnpm start
```

Build standalone `.app`:
```bash
./scripts/build.sh
```

Output is in `dist/mac-arm64/` or `dist/mac/`.

</details>
