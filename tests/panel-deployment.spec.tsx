// @vitest-environment jsdom
// The Deployment settings and the Plugin Manager page.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { PluginConfig } from '../src/client/deployment.tsx'
import { expect, it, onTestFinished, vi } from 'vitest'
import { zh } from '../src/client/locales.ts'
import { usePanel, mount, remount, settle, all, find, tab, click, type, text, field, at, translator } from './fixtures/panel.tsx'
import { server, problemOf, fakeForm } from './fixtures/panel-server.ts'

usePanel()
it('saves this machine\'s settings in the Deployment settings through DSH\'s configuration form, without a restart', async () => {
  const { form: editable, mutations } = fakeForm()
  server.form = editable
  await mount()
  await click(tab(zh['tab.settings']))
  await click(find(zh['settingsGroup.deployment'], '.dt-settings-link'))
  expect(text()).toContain('/srv/dsh-superagent')
  // Accounts are on the Source settings; the Plugin Manager page, where those are not at hand, shows them here.
  expect(text()).not.toContain('@agent-bot')
  for (const moved of ['仓库克隆', '工单 worktree 目录', '禁用的命令']) expect(text()).not.toContain(moved)
  expect(text()).toContain(zh.deploymentIntro)
  // A limit applies at once, so a draft of one says only that it is unsaved, even while Assignments run.
  await type(field<HTMLInputElement>(zh.deploymentContextTimeout), '20000')
  expect(document.querySelector('.dt-savebar')?.textContent).toBe(`${zh.draftKept}${zh.discard}${zh.save}`)
  await click(zh.save)
  expect(mutations).toEqual([{ revision: 1, ops: [{ op: 'set', path: ['admissionContextTimeoutMs'], value: 20000 }] }])
  expect(document.querySelector('.dt-toast')?.textContent).toBe(zh.saved)
  expect(text()).not.toContain(zh.savedRestarting)
  expect(field<HTMLInputElement>(zh.deploymentContextTimeout).value).toBe('20000')
})

it('keeps a refused Deployment change as a draft, and shows the settings read-only without a writable form', async () => {
  const refusing = fakeForm(true, false)
  server.form = refusing.form
  at({ page: 'settings', query: { group: 'deployment' } })
  await mount()
  await type(field<HTMLInputElement>(zh.deploymentPromptMaxChars), '200000')
  await click(zh.save)
  expect(document.querySelector('[role="alert"]')?.textContent).toBe(zh.deploymentRefused)
  expect(field<HTMLInputElement>(zh.deploymentPromptMaxChars).value).toBe('200000')
  server.form = fakeForm(false).form
  await remount()
  expect(text()).toContain(zh.deploymentReadOnly)
  server.form = undefined
  await remount()
  expect(text()).toContain('这个 DSH 版本不提供配置表单')
  expect(field<HTMLInputElement>(zh.deploymentPromptMaxChars)).toMatchObject({ disabled: true, value: '100000' })
  expect(all('button').some(button => button.textContent === '保存')).toBe(false)
})

it('merges a Deployment draft into the values another page saved meanwhile, and writes only what it changed', async () => {
  const { form: shared, mutations } = fakeForm()
  server.form = shared
  at({ page: 'settings', query: { group: 'deployment' } })
  await mount()
  await type(field<HTMLInputElement>(zh.deploymentContextPages), '20')
  // The Plugin Manager page saves another field of the same entry meanwhile.
  await act(async () => { await shared.mutate([{ op: 'set', path: ['promptMaxChars'], value: 50000 }], 1) })
  expect(text()).toContain('设置已在别处修改，你的修改已合并到最新版本')
  expect(field<HTMLInputElement>(zh.deploymentPromptMaxChars).value).toBe('50000')
  await click(zh.save)
  expect(mutations.at(-1)).toEqual({ revision: 2, ops: [{ op: 'set', path: ['admissionContextMaxPages'], value: 20 }] })
  expect(shared.getSnapshot().value).toMatchObject({ admissionContextMaxPages: 20, promptMaxChars: 50000 })
})

it('renders the Deployment page with the derived accounts in the Plugin Manager, and no summary', async () => {
  let container = document.createElement('div')
  let root = createRoot(container)
  onTestFinished(() => { act(() => { root.unmount() }); container.remove() })
  // Remount from scratch on each render to match Plugin Manager page navigation.
  const render = async (view: 'page' | 'summary') => {
    act(() => { root.unmount() }); container.remove()
    container = document.createElement('div'); document.body.append(container)
    root = createRoot(container)
    const form = server.form
    await act(async () => { root.render(<PluginConfig t={translator(zh)} view={view} form={form && { state: form.getSnapshot(),
      mutate: form.mutate }} />) })
    await settle()
  }
  await render('summary')
  expect(container.textContent).toBe('')
  server.form = fakeForm().form
  await render('page')
  for (const fact of ['acme/widgets', '@agent-bot', 'Widgets Bot', '账号在 dsh-superagent 面板的来源设置里修改。']) expect(text()).toContain(fact)
  server.setup = { ...server.setup, problem: problemOf('repositoryUnset'), accounts: null }
  await render('page')
  expect(text()).toContain('部署检查未通过：GitHub 来源没有设置监听的仓库。')
  expect(field<HTMLInputElement>(zh.deploymentPromptMaxChars).disabled).toBe(false)
  server.down = true
  await render('page')
  expect(text()).toContain(zh.hostNotRunning)
})

it('tells a dsh-superagent that is starting from a browser that cannot write on the Deployment page', async () => {
  const { form: shared, publish } = fakeForm()
  server.form = shared
  at({ page: 'settings', query: { group: 'deployment' } })
  await mount()
  const limit = () => field<HTMLInputElement>(zh.deploymentPromptMaxChars)
  expect(limit().disabled).toBe(false)
  // While dsh-superagent restarts, DSH stops serving its entry; the values come back editable once it is served again.
  await act(async () => { publish({ status: 'unavailable' }) })
  expect(text()).toContain(zh.deploymentUnavailable)
  expect(limit().disabled).toBe(true)
  await act(async () => { publish({ status: 'ready' }) })
  expect(limit().disabled).toBe(false)
  await act(async () => { publish({ mode: 'memory', status: 'unavailable', writable: false }) })
  expect(text()).toContain(zh.deploymentReadOnly)
})

it('reads the state every second after a setup check, until dsh-superagent stopped answering and answers again', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  onTestFinished(() => { vi.useRealTimers() })
  server.setup = { ...server.setup, problem: problemOf('agentCliUnset'), accounts: null }
  at({ page: 'settings', query: { group: 'deployment' } })
  await mount()
  await click(zh.setupCheck)
  const second = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(1000) }); await settle() }
  server.down = true
  await second()
  expect(text()).toContain(zh['setup.agentCliUnset'])
  server.down = false
  server.setup = { ...server.setup, problem: null }
  await second()
  expect(text()).not.toContain(zh['setup.agentCliUnset'])
  // Once it answers, the state is read every five seconds again.
  const reads = server.requests.filter(request => request.path === 'state').length
  await act(async () => { await vi.advanceTimersByTimeAsync(3000) }); await settle()
  expect(server.requests.filter(request => request.path === 'state')).toHaveLength(reads)
})

it('ends a restart that never stopped answering after half a minute, and reads the state every five seconds again', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  onTestFinished(() => { vi.useRealTimers() })
  server.setup = { ...server.setup, problem: problemOf('agentCliUnset'), accounts: null }
  at({ page: 'settings', query: { group: 'deployment' } })
  await mount()
  await click(zh.setupCheck)
  const reads = () => server.requests.filter(request => request.path === 'state').length
  const advance = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms) }); await settle() }
  const before = reads()
  await advance(10_000)
  expect(reads() - before).toBeGreaterThanOrEqual(8)
  // The restart ends at 30 s; the state is read at once, then every five seconds.
  await advance(21_000)
  const ended = reads()
  await advance(3_000)
  expect(reads()).toBe(ended)
  await advance(2_000)
  expect(reads()).toBe(ended + 1)
})

it('shows the running checkout with its short commit, commit time, work tree and matched chain repository', async () => {
  at({ page: 'settings', query: { group: 'deployment' } })
  await mount()
  expect(text()).toContain(zh.deploymentCheckout)
  expect(text()).toContain('/srv/dsh-superagent')
  expect(text()).toContain('main')
  expect(text()).toContain('acme/widgets')
  expect(text()).toContain(zh.deploymentCheckoutClean)
  expect(document.querySelector('code[title="0123456789abcdef0123456789abcdef01234567"]')?.textContent).toBe('0123456')
  expect(all('time').at(-1)?.getAttribute('datetime')).toBe('2026-09-23T00:00:00Z')
  // A dirty work tree says so instead of reporting it clean.
  server.prepare = { ...server.prepare, checkout: { ...server.prepare.checkout, dirty: true } }
  await remount()
  expect(text()).toContain(zh.deploymentCheckoutDirty)
})

it('lists the localized reasons a checkout cannot take a merge and disables the action', async () => {
  at({ page: 'settings', query: { group: 'deployment' } })
  server.prepare = { ...server.prepare, available: false, reasons: ['notMain', 'dirty', 'noChain'], chain: null, repository: null }
  await mount()
  expect(text()).toContain(zh.deploymentCheckoutUnavailableReason)
  for (const reason of ['checkoutReason.notMain', 'checkoutReason.dirty', 'checkoutReason.noChain'] as const) expect(text()).toContain(zh[reason])
  expect(all('button').find(item => item.textContent === zh.deploymentCheckoutAction)?.hasAttribute('disabled')).toBe(true)
})

it('waits for setup before offering a pull and build', async () => {
  at({ page: 'settings', query: { group: 'deployment' } })
  server.setup = { ...server.setup, accounts: null }
  await mount()
  expect(text()).toContain(zh.deploymentCheckoutWaiting)
  expect(all('button').some(item => item.textContent === zh.deploymentCheckoutAction)).toBe(false)
})

it('runs one pull and build after confirmation, then shows the new commit and that a restart applies it', async () => {
  at({ page: 'settings', query: { group: 'deployment' } })
  await mount()
  await click(zh.deploymentCheckoutAction)
  expect(text()).toContain(zh.deploymentCheckoutActionTitle)
  expect(text()).toContain('将从 acme/widgets 拉取 main 并重新构建；不会重启 dsh-superagent，重启后生效。')
  // A double click on the confirmation still runs one pull and build.
  const confirm = find(zh.confirm)
  await act(async () => { confirm.click(); confirm.click() })
  await settle()
  expect(server.requests.filter(request => request.method === 'POST' && request.path === 'deployment/prepare')).toHaveLength(1)
  expect(document.querySelector('.dt-toast')?.textContent).toBe(zh.deploymentCheckoutMerged)
  expect(text()).toContain('fedcba9')
  expect(text()).toContain(zh.deploymentCheckoutRestart)
})

it('keeps the Deployment page and shows the script message and the log path when the pull and build fails', async () => {
  at({ page: 'settings', query: { group: 'deployment' } })
  const message = 'prepare: this checkout has uncommitted changes; commit or stash them first:\n M readme.md'
  const log = '/srv/dsh-superagent/prepare/prepare-20261112-000000-1.log'
  server.prepareFailure = { message, log }
  await mount()
  await click(zh.deploymentCheckoutAction)
  await click(zh.confirm)
  expect(server.requests.filter(request => request.method === 'POST' && request.path === 'deployment/prepare')).toHaveLength(1)
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(zh.deploymentCheckoutFailed)
  expect(text()).toContain('uncommitted changes')
  expect(text()).toContain(log)
  // The page keeps its facts and the action, so another attempt needs no navigation.
  expect(text()).toContain('0123456')
  expect(all('button').some(item => item.textContent === zh.deploymentCheckoutAction)).toBe(true)
})
