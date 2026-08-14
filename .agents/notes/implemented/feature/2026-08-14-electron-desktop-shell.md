# Agent Note: Electron desktop shell — a native window over the existing Web server

Status: implemented

English | [中文](2026-08-14-electron-desktop-shell.zh.md)

## Problem

DeepSeek Harness ships a browser GUI through `dsh web`, which serves the built frontend over a loopback HTTP server. Starting that GUI today requires a terminal: a user runs `pnpm dsh web` (or the installed `dsh web`) and then opens the printed URL. There is no desktop entry point, so the product cannot be launched by clicking an installed application on Windows, Linux, or macOS.

The GUI layering Agent Note already reserves an Electron client, but its planned carrier loads the frontend over `file://` and routes fetch through an IPC bridge. That carrier is not built; the client connection layer still assumes an HTTP uplink and WebSocket downlinks. Shipping a desktop app therefore needs a decision about which transport to use first and how much of the client layer to change now.

## Decision

`apps/desktop` (`@deepseek-ai/dsh-desktop`) is a thin Electron shell around the existing Web server. It changes no client or host package.

### Process model

The Electron main process spawns the shipped CLI as a child process with `ELECTRON_RUN_AS_NODE=1` plus Node's `--expose-internals` flag, and the arguments `web --host 127.0.0.1 --port 0`. Electron embeds its own Node runtime but does not expose the embedder symbol expected by `node-addon-require-builtin`, so the child uses `--expose-internals` for the internal loader that the HMR service needs. The launcher resolves the CLI bin from the `@deepseek-ai/dsh` dependency, reads the `dsh web: http://127.0.0.1:<port>` readiness line from stdout, and loads that URL in a `BrowserWindow`. The child is killed on `before-quit`. `port 0` asks the OS for a free loopback port, so two app instances never collide and the server never binds a network interface.

The launcher logic is Electron-free and lives in `src/launcher.ts`; `src/main.ts` owns window and lifecycle, and `src/preload.ts` exposes only `platform` and `versions` metadata. Unit tests cover readiness-line parsing, argument assembly, and bin resolution.

### Security posture

The window uses `contextIsolation: true`, `nodeIntegration: false`, and a preload that exports no privileged API. External URLs open in the system browser, and same-window navigation away from the loopback origin is blocked. The existing `/api` browser-trust fence still applies because the frontend talks to the loopback HTTP/WebSocket transport exactly as in `dsh web`.

### Packaging
Electron Builder produces an NSIS installer and a portable zip on Windows, AppImage and deb on Linux, and dmg and zip on macOS. The packaged icons use `assets/icon2.png`; macOS uses a 512px `apps/desktop/build/icon.png` generated from that source because electron-builder requires a 512px input for icns conversion. Pushing a `v*`, `dsh-v*`, or `desktop-v*` tag attaches those installers and the portable zip to the GitHub Release. The desktop package depends on `@deepseek-ai/dsh`, so the installer bundles the CLI and the Web frontend dist through the existing dependency closure. `asar` is disabled and native rebuilds are skipped: the spawned CLI child must read its real `node_modules`. The runtime addon that inspects Node internals is unavailable under Electron, so the shell passes `--expose-internals` to the child instead of relying on the addon.

## Alternatives considered

| Rejected | One-line reason |
|---|---|
| Loading the frontend over `file://` with an IPC fetch bridge | The planned carrier needs a new `AbstractApiClient.doFetch` implementation and a main-process bridge across the connection layer; that is a client-layer project, not a shell wrapper, and would block the desktop entry point on that work |
| Booting the Cordis web profile in-process inside Electron | The CLI bundles only its bin entry with hashed chunks and exposes no programmatic boot API, so in-process boot would fork the CLI's boot path and duplicate its shutdown wiring |
| Serving on a fixed port | Fixed ports collide between instances and can leak the unauthenticated loopback server to a wider process; an OS-assigned port keeps the posture private by default |
| Shipping the desktop app outside the workspace | `apps/*` is the repository's product-assembly tier and already has publication constraints; a new workspace member keeps packaging, typechecking, and documentation gates consistent |
| Enabling Electron's default binary download through pnpm | Electron 43 no longer runs a postinstall, so the workspace records an explicit `install-electron` step in the development flow instead of an unused build-script allowlist entry |

## Consequences

A user can install and click the desktop app on the three desktop platforms, and the shell reuses the tested `dsh web` assembly without touching the agent loop or client packages. The cost is that the shipped Electron shell still runs a loopback HTTP server rather than the eventual `file://`/IPC carrier; that work stays open in the GUI layering Agent Note and must land before the desktop app can drop its child-process server. Packaging is intentionally host-per-host: each installer is built on its own platform, and the desktop package is not wired into the root library build because it is an end product, not a publishable library artifact.
