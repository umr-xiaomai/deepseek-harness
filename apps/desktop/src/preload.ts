import { contextBridge } from 'electron'

/**
 * Preload bridge: expose only platform metadata to the Web renderer. The Web
 * app talks to its host over the loopback HTTP/WebSocket transport; no
 * privileged Electron API crosses this boundary yet.
 * @module @deepseek-ai/dsh-desktop/preload
 */
contextBridge.exposeInMainWorld('dshDesktop', {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
})
