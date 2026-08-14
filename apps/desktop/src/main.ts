import { app, BrowserWindow, dialog, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import { launchWebServer, type WebServerProcess } from './launcher.ts'

/**
 * The Electron main process: start the bundled Web server on a loopback port,
 * then open it in a native window. The server is the same `dsh web` assembly
 * the CLI serves, so every Web capability keeps its existing behavior.
 * @module @deepseek-ai/dsh-desktop/main
 */

let webServer: WebServerProcess | undefined
let webUrl: string | undefined

/**
 * Create the shell window around a resolved Web URL. External targets open in
 * the system browser; same-origin SPA navigation stays inside the shell.
 * @param url - the canonical loopback URL of the running Web server.
 * @returns the created window once it has loaded.
 */
async function openWindow(url: string): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: 'DeepSeek Harness',
    backgroundColor: '#0e1116',
    webPreferences: {
      preload: fileURLToPath(new URL('./preload.js', import.meta.url)),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  window.once('ready-to-show', () => {
    window.show()
  })
  window.webContents.setWindowOpenHandler(({ url: target }) => {
    void shell.openExternal(target)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, target) => {
    if (new URL(target).origin !== new URL(url).origin) event.preventDefault()
  })
  await window.loadURL(url)
  return window
}

/** Boot the server and open the shell, reporting failures through the native UI. */
async function start(): Promise<void> {
  webServer = launchWebServer()
  webUrl = await webServer.ready
  await openWindow(webUrl)
}

app.whenReady().then(async () => {
  try {
    await start()
  } catch (error) {
    dialog.showErrorBox('DeepSeek Harness failed to start', error instanceof Error ? error.message : String(error))
    app.quit()
  }
}, (error: unknown) => {
  dialog.showErrorBox('DeepSeek Harness failed to start', error instanceof Error ? error.message : String(error))
  app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && webUrl !== undefined) {
    void openWindow(webUrl)
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  webServer?.stop()
})
