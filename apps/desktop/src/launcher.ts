import { spawn } from 'node:child_process'
import type { ChildProcessByStdio } from 'node:child_process'
import type { Readable } from 'node:stream'
import { createRequire } from 'node:module'

/**
 * Desktop launch glue: boot the bundled `dsh web` server on a loopback port,
 * parse its readiness line, and expose the child process lifecycle. This
 * module stays Electron-free so the pure parts run under plain Node/vitest.
 * @module @deepseek-ai/dsh-desktop/launcher
 */

const localRequire = createRequire(import.meta.url)
const localResolve = localRequire.resolve.bind(localRequire)

/** The readiness line printed once the Web server has bound its port. */
const READY_URL_PATTERN = /^dsh web: (http:\/\/127\.0\.0\.1:\d+)/

/** Flags the Electron shell passes to `dsh web`. */
export interface WebServerOptions {
  /** Listen host; the desktop shell always uses loopback. */
  host?: string
  /** Listen port; `0` asks the OS for a free loopback port. */
  port?: number
  /** Extra authorities the /api browser-trust fence accepts. */
  trustedHosts?: string[]
}

/** The spawned `dsh web` process and its readiness contract. */
export interface WebServerProcess {
  /** The underlying Node/Electron child process. */
  child: ChildProcessByStdio<null, Readable, Readable>
  /** Resolves with the canonical loopback URL, or rejects if startup fails. */
  ready: Promise<string>
  /** Terminate the child process. */
  stop: () => void
}

/**
 * Build the `dsh web` argument list. Host and port are always explicit so the
 * shell owns the loopback posture and an OS-assigned port stays deterministic.
 * @param options - optional host, port, and trusted-host overrides.
 * @returns the argument list following the CLI entry path.
 */
export function webServerArgs(options: WebServerOptions = {}): string[] {
  const args = ['web', '--host', options.host ?? '127.0.0.1', '--port', String(options.port ?? 0)]
  if (options.trustedHosts?.length !== 0 && options.trustedHosts !== undefined) {
    args.push('--trusted-host', ...options.trustedHosts)
  }
  return args
}

/**
 * Extract the canonical loopback URL from a `dsh web` stdout line.
 * @param line - one line of child-process output.
 * @returns the URL, or `undefined` when the line is not the readiness line.
 */
export function parseReadyUrl(line: string): string | undefined {
  return READY_URL_PATTERN.exec(line.trim())?.[1]
}

/**
 * Resolve the shipped CLI entry, honoring an explicit override for tests and
 * unusual deployments.
 * @param resolveFrom - resolver rooted in this module's own package tree.
 * @param env - the process environment carrying the optional override.
 * @returns the absolute path to the CLI bin.
 */
export function resolveCliBin(
  resolveFrom: (id: string) => string = localResolve,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const override = env.DSH_DESKTOP_CLI_BIN
  if (override !== undefined && override !== '') return override
  return resolveFrom('@deepseek-ai/dsh/lib/bin.js')
}

/**
 * Node flags the Electron-as-Node child needs. Electron embeds its own Node
 * runtime but does not expose the embedder symbol expected by
 * `node-addon-require-builtin`, so the CLI's internal loader has to use
 * Node's supported `--expose-internals` escape hatch instead.
 */
export function webServerNodeArgs(): string[] {
  return ['--expose-internals']
}

/**
 * Spawn the bundled CLI as a Node process and wait for its readiness line.
 * The Electron binary runs as plain Node via `ELECTRON_RUN_AS_NODE`, so the
 * same packaged runtime serves both the shell and the Web server.
 * @param options - Web server flags forwarded to `dsh web`.
 * @param env - the child process environment.
 * @returns the child handle plus a promise for the loopback URL.
 */
export function launchWebServer(options: WebServerOptions = {}, env: NodeJS.ProcessEnv = process.env): WebServerProcess {
  const child = spawn(process.execPath, [...webServerNodeArgs(), resolveCliBin(localResolve, env), ...webServerArgs(options)], {
    env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  const ready = new Promise<string>((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
      const url = parseReadyUrl(stdout)
      if (url !== undefined) resolve(url)
    })
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      const status = code === null ? `signal ${signal ?? 'unknown'}` : `code ${code}`
      reject(new Error(`dsh web exited before it was ready (${status})${stderr === '' ? '' : `: ${stderr.trim()}`}`))
    })
  })
  return { child, ready, stop: () => { child.kill() } }
}
