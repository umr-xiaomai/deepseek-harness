import { describe, expect, it } from 'vitest'
import { parseReadyUrl, resolveCliBin, webServerArgs, webServerNodeArgs } from '../src/launcher.ts'

describe('parseReadyUrl', () => {
  it('extracts the canonical loopback URL from the readiness line', () => {
    expect(parseReadyUrl('dsh web: http://127.0.0.1:34123 (LAN: http://192.168.1.5:34123)')).toBe('http://127.0.0.1:34123')
  })

  it('ignores lines that do not announce a bound server', () => {
    expect(parseReadyUrl('compiling plugins…')).toBeUndefined()
    expect(parseReadyUrl('dsh web: ready')).toBeUndefined()
  })
})

describe('webServerArgs', () => {
  it('defaults to loopback with an OS-assigned port', () => {
    expect(webServerArgs()).toEqual(['web', '--host', '127.0.0.1', '--port', '0'])
  })

  it('forwards host, port, and trusted-host overrides in order', () => {
    expect(webServerArgs({ host: '127.0.0.1', port: 8123, trustedHosts: ['app.internal', 'app.internal:3080'] })).toEqual([
      'web',
      '--host',
      '127.0.0.1',
      '--port',
      '8123',
      '--trusted-host',
      'app.internal',
      'app.internal:3080',
    ])
  })
})

describe('webServerNodeArgs', () => {
  it('enables Node internal access for the Electron child process', () => {
    expect(webServerNodeArgs()).toEqual(['--expose-internals'])
  })
})

describe('resolveCliBin', () => {
  it('prefers an explicit override when one is set', () => {
    expect(resolveCliBin(() => '/never-resolved', { DSH_DESKTOP_CLI_BIN: '/custom/bin.js' })).toBe('/custom/bin.js')
  })

  it('resolves the shipped CLI entry from the package tree', () => {
    const resolver = (id: string): string => `/resolved/${id}`
    expect(resolveCliBin(resolver, {})).toBe('/resolved/@deepseek-ai/dsh/lib/bin.js')
  })

  it('resolves the shipped CLI entry without evaluating its ESM module', () => {
    expect(resolveCliBin()).toMatch(/[\\/]lib[\\/]bin\.js$/)
  })
})
