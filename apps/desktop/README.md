# `@deepseek-ai/dsh-desktop`

English | [中文](README.zh.md)

Electron desktop shell for the DeepSeek Harness Web GUI. It launches the bundled `dsh web` server on an OS-assigned loopback port and opens the same browser UI in a native window, so clicking the installed application starts the product without a terminal.

## What it does

- Boots `dsh web` as an Electron-as-Node child process (`ELECTRON_RUN_AS_NODE=1` plus `--expose-internals`), keeping the existing Web composition and its security posture.
- Binds the server to `127.0.0.1` with port `0`, so it never collides with another instance and never listens on a network interface.
- Loads the returned loopback URL in an Electron `BrowserWindow`; external targets open in the system browser.
- Stops the child server on quit.

## Run from source

Prerequisites: Node 22.19+ or 24+, pnpm, and a built repository. From the repository root:

```sh
pnpm install
pnpm run build
pnpm install-electron
pnpm desktop:dev
```

`pnpm install-electron` downloads the Electron runtime once; `pnpm desktop:dev` builds this package and starts Electron. The Web frontend and CLI runtime must already be built by `pnpm run build`.

## Test

```sh
pnpm desktop:test
```

The unit suite covers the Electron-free launcher logic: readiness-line parsing, argument assembly, and CLI-entry resolution.

## Package

Electron Builder produces installers from this package:

```sh
pnpm desktop:pack:win     # NSIS .exe
pnpm desktop:pack:linux   # AppImage and .deb
pnpm desktop:pack:mac     # .dmg and .zip
pnpm desktop:pack         # host-platform targets
```

Artifacts land in `apps/desktop/release/`. Cross-building is not attempted: build each target on its own platform.

## How it works

The main process ([`src/main.ts`](src/main.ts)) waits for Electron readiness, then calls [`src/launcher.ts`](src/launcher.ts) to spawn the shipped CLI bin with `--expose-internals web --host 127.0.0.1 --port 0`. The launcher resolves the bin from the `@deepseek-ai/dsh` dependency, reads the `dsh web: http://127.0.0.1:<port>` readiness line, and hands the URL to the window loader. A minimal preload ([`src/preload.ts`](src/preload.ts)) exposes only platform metadata; no privileged Electron API crosses into the renderer.

The long-term Electron plan is to load the frontend over `file://` through an IPC fetch bridge instead of the loopback HTTP server. That requires the client connection carrier work described in the GUI layering Agent Note and is deliberately deferred here.
