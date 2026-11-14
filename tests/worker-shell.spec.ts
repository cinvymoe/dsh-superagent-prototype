import { describe, expect, it, vi } from 'vitest'
import type { ShellExecSpec } from '@deepseek-ai/dsh-shell'
import { sessionOf, withWorkerEnvironment } from '../src/worker-shell.ts'

const spec = (env?: Record<string, string>): ShellExecSpec => ({ command: 'gh api user', workdir: '/srv/work', timeoutMs: 5000,
  onExpiry: 'kill', stdoutMaxBytes: 4096, sandboxPolicy: undefined, ...env ? { env } : {} })

describe('the worker shell environment', () => {
  it('reads the calling Session id from DSH\'s managed environment, and nothing when DSH did not provide one', () => {
    expect(sessionOf({ dshEnv: { DSH_SESSION_ID: 'worker-t1' } })).toBe('worker-t1')
    expect(sessionOf({})).toBeUndefined()
  })
  it('applies the environment of the calling Session over the command\'s own, so each worker\'s shell gets its ticket chain', () => {
    const provider = { environment: vi.fn((sessionId?: string) => ({ PATH: `/srv/chains/${sessionId}:/usr/bin`, GIT_CONFIG_GLOBAL: `/srv/chains/${sessionId}/gitconfig` })) }
    const resolved = withWorkerEnvironment(spec({ KEEP: 'yes' }), provider, 'worker-t1')
    expect(provider.environment).toHaveBeenCalledExactlyOnceWith('worker-t1')
    expect(resolved.env).toEqual({ KEEP: 'yes', PATH: '/srv/chains/worker-t1:/usr/bin', GIT_CONFIG_GLOBAL: '/srv/chains/worker-t1/gitconfig' })
    expect(resolved.command).toBe('gh api user')
  })
  it('leaves the command\'s environment alone when no provider is loaded', () => {
    expect(withWorkerEnvironment(spec({ PATH: '/usr/bin' }), undefined, 'worker-t1').env).toEqual({ PATH: '/usr/bin' })
  })
})
