import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { Landing, supervisorUnit } from '../src/app/landing.ts'
import { Later } from '../src/app/effects.ts'
import type { CheckoutView } from '../src/app/checkout.ts'
import type { PrepareStatus } from '../src/app/prepare.ts'

const HEAD = 'a'.repeat(40)
const NEXT = 'b'.repeat(40)
const view = (overrides: Partial<CheckoutView> = {}): CheckoutView => ({ path: '/srv/dsh-superagent', repository: 'acme/widgets', branch: 'main',
  head: HEAD, committedAt: '2026-09-23T00:00:00Z', dirty: false, remotes: [{ name: 'origin', repository: 'acme/widgets' }],
  available: true, reasons: [], restartRequired: false, ...overrides })

interface Harness { running?: number; unit?: string | null; merged?: boolean; restartOk?: boolean }
function harness(options: Harness = {}) {
  const merge = vi.fn(async () => ({ merged: options.merged ?? true, head: options.merged === false ? HEAD : NEXT, log: '/state/prepare/prepare-1.log' }))
  const restart = vi.fn(() => ({ ok: options.restartOk ?? true, output: 'ok' }))
  const status = async (): Promise<PrepareStatus> => ({ checkout: options.merged === false ? view() : view({ head: NEXT }), chain: 'default',
    repository: 'acme/widgets', available: true, reasons: [], running: false })
  const landing = new Landing({ checkout: { status: async () => view() }, prepare: { status, merge },
    running: () => options.running ?? 0, unit: () => (options.unit === undefined ? 'dsh-web.service' : options.unit), restart,
    logDir: join(tmpdir(), 'dsh-superagent-landing-test') })
  return { landing, merge, restart }
}

describe('Landing', () => {
  it('lands a merge by pulling and rebuilding, then asking the unit that started this process to restart it', async () => {
    const { landing, merge, restart } = harness()
    await expect(landing.land('acme/widgets')).resolves.toEqual({ landed: true, head: NEXT })
    expect(merge).toHaveBeenCalledTimes(1)
    expect(restart).toHaveBeenCalledWith('dsh-web.service')
  })
  it('waits while a worker runs, so the restart never interrupts a Session', async () => {
    const { landing, merge } = harness({ running: 2 })
    await expect(landing.land('acme/widgets')).rejects.toBeInstanceOf(Later)
    expect(merge).not.toHaveBeenCalled()
  })
  it('leaves a merge that did not move the checkout alone instead of restarting for nothing', async () => {
    const { landing, restart } = harness({ merged: false })
    await expect(landing.land('acme/widgets')).resolves.toEqual({ landed: false, head: HEAD, reason: 'current' })
    expect(restart).not.toHaveBeenCalled()
  })
  it('refuses a repository this checkout does not track', async () => {
    const { landing, merge } = harness()
    await expect(landing.land('other/widgets')).resolves.toEqual({ landed: false, head: NEXT, reason: 'otherRepository' })
    expect(merge).not.toHaveBeenCalled()
  })
  it('reports a process no supervisor owns instead of stopping it', async () => {
    const { landing, merge } = harness({ unit: null })
    await expect(landing.land('acme/widgets')).resolves.toEqual({ landed: false, head: NEXT, reason: 'unsupervised' })
    expect(merge).not.toHaveBeenCalled()
  })
  it('reports a restart the supervisor refused', async () => {
    const { landing } = harness({ restartOk: false })
    await expect(landing.land('acme/widgets')).resolves.toEqual({ landed: false, head: NEXT, reason: 'restartFailed' })
  })
  it('answers whether a merge could land now, and why not', async () => {
    const busy = harness({ running: 1, unit: null })
    const status = await busy.landing.status()
    expect(status).toMatchObject({ unit: null, available: false, running: 1, reasons: ['unsupervised', 'running'] })
    const idle = await harness().landing.status()
    expect(idle).toMatchObject({ unit: 'dsh-web.service', available: true, reasons: [] })
  })
})

describe('supervisorUnit', () => {
  it('names the service unit that owns this process', () => {
    expect(supervisorUnit('0::/system.slice/dsh-web.service')).toBe('dsh-web.service')
    expect(supervisorUnit('0::/system.slice/dsh-web.service/child.scope')).toBe('dsh-web.service')
    expect(supervisorUnit('12:devices:/system.slice/dsh-superagent.service\n0::/system.slice/dsh-superagent.service')).toBe('dsh-superagent.service')
  })
  it('names no unit for a process no service unit owns', () => {
    expect(supervisorUnit('0::/user.slice/user-0.slice/session-3.scope')).toBeNull()
    expect(supervisorUnit('')).toBeNull()
  })
})
