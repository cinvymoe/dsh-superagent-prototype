// @vitest-environment jsdom
// The Agents settings group: role cards, inherited models, tool catalogs, the Executor link, drafts and history.
import { expect, it } from 'vitest'
import type { AgentsConfig } from '../src/policy.ts'
import { en, zh } from '../src/client/locales.ts'
import { usePanel, mount, remount, settle, all, find, tab, click, type, text, field, at } from './fixtures/panel.tsx'
import { server } from './fixtures/panel-server.ts'

usePanel()
const current = () => document.querySelector('.dt-settings-link[aria-current="page"]')?.textContent
const open = async () => {
  await mount()
  await click(tab(zh['tab.settings']))
  await click(zh['settingsGroup.agents'])
}
const card = (role: string) => {
  const element = document.querySelector<HTMLElement>(`[data-agent-role="${role}"]`)
  if (!element) throw new Error(`No ${role} card`)
  return element
}
const inheritedLine = (role: string) => card(role).querySelector('.dt-lv')?.textContent ?? ''
const selects = (role: string) => [...card(role).querySelectorAll<HTMLSelectElement>('.dt-model select')]
const optionText = (select: HTMLSelectElement) => [...select.options].map(option => option.textContent ?? '')
const pick = async (role: string, name: 'provider' | 'model' | 'effort', value: string) => {
  const target = selects(role).find(select => select.id.endsWith(`-${name}`))
  if (!target) throw new Error(`No ${role} ${name} select`)
  await type(target, value)
}
const switchOf = (role: string, tool: string) => {
  const element = card(role).querySelector<HTMLElement>(`[role="switch"][aria-label="${tool}"]`)
  if (!element) throw new Error(`No ${role} switch ${tool}`)
  return element
}

it('adds Agents between Execution and Prompts and keeps the group when the panel remounts', async () => {
  await mount()
  await click(tab(zh['tab.settings']))
  expect(all('.dt-settings-link').map(link => link.textContent)).toEqual(['来源', '评估', '执行', '智能体', '提示词', '部署'])
  expect(all('.dt-settings-link')[3]!.textContent).toBe(zh['settingsGroup.agents'])
  await click(zh['settingsGroup.agents'])
  expect(current()).toBe(zh['settingsGroup.agents'])
  // Leaving the Settings tab keeps the group it last opened.
  await click(tab(zh['tab.eval']))
  await remount()
  await click(tab(zh['tab.settings']))
  expect(current()).toBe(zh['settingsGroup.agents'])
  // A saved settings route reopens the same group.
  at({ page: 'settings', query: { group: 'agents' } })
  await remount()
  expect(current()).toBe(zh['settingsGroup.agents'])
})

it('lists the three roles with their own tool catalogs and says subagents inherit the executor\'s optional tools', async () => {
  await open()
  expect(all('[data-agent-role]').map(item => item.querySelector('.dt-block-title')?.textContent))
    .toEqual([zh['agentRole.main'], zh['agentRole.aligner'], zh['agentRole.executor']])
  expect(text()).toContain(zh.agentsIntroShort)
  expect(zh.agentsIntroShort).toContain('工具目录')
  expect(zh.agentsIntroShort).toContain('子代理')
  for (const role of ['main', 'aligner', 'executor']) expect(all(`[data-agent-role="${role}"] [role="switch"]`).length).toBeGreaterThan(0)
})

it('shows the Executor\'s running load and links to Execution settings instead of editing concurrency here', async () => {
  await open()
  const load = [...card('executor').querySelectorAll('.dt-lv')].find(item => item.textContent?.startsWith(zh.executingLabel))
  expect(load?.textContent).toBe(`${zh.executingLabel} 2 / 3`)
  // Concurrency has one place: the Execution group.
  expect(all('input[type="number"]')).toEqual([])
  await click(find(zh.agentChangeConcurrency, '[data-agent-role="executor"] button'))
  expect(current()).toBe(zh['settingsGroup.execution'])
  expect(field<HTMLInputElement>(zh.maxWorkers).value).toBe('3')
})

it('shows the model a blank override inherits, follows an executor override, and restores inheritance in one click', async () => {
  server.settings = { ...server.settings, eval: { ...server.settings.eval, model: { provider: 'eval-provider', model: 'eval-model' } },
    executor: { ...server.settings.executor, model: { provider: 'exec-provider', model: 'exec-model', reasoningEffort: 'high' } } }
  await open()
  expect(inheritedLine('main')).toContain('eval-provider / eval-model')
  expect(inheritedLine('aligner')).toContain('exec-provider / exec-model · high')
  expect(inheritedLine('executor')).toContain('exec-provider / exec-model · high')
  // An executor override moves the aligner with it, while the executor's own blank field keeps inheriting Execution settings.
  await pick('executor', 'provider', 'worker-provider'); await pick('executor', 'model', 'worker-model')
  await pick('executor', 'effort', 'high')
  expect(inheritedLine('aligner')).toContain('worker-provider / worker-model · high')
  expect(inheritedLine('executor')).toContain('exec-provider / exec-model · high')
  // One click on Restore inheritance clears a role's override again.
  await pick('main', 'provider', 'other-provider'); await pick('main', 'model', 'other-model')
  await click(find(zh.agentRestoreInherit, '[data-agent-role="main"] button'))
  expect(selects('main').map(select => select.value)).toEqual(['', '', ''])
  await click(zh.save)
  expect(server.settings.agents.main.model).toBeNull()
  expect(server.settings.agents.executor.model).toEqual({ provider: 'worker-provider', model: 'worker-model',
    reasoningEffort: 'high' })
})

it('offers real provider, model and effort selects, grouped by provider until one is chosen', async () => {
  await open()
  await settle()
  const [provider, model, effort] = selects('main')
  expect(selects('main')).toHaveLength(3)
  expect(optionText(provider!)).toEqual([zh.modelInherit, 'Worker provider', 'Other provider'])
  // With no provider chosen, the model select keeps every model, grouped by provider, and effort waits for a model.
  expect([...model!.querySelectorAll('optgroup')].map(group => group.getAttribute('label')))
    .toEqual(['Worker provider', 'Other provider'])
  expect(optionText(model!)).toEqual([zh.modelInherit, 'Worker model', 'Worker fast', 'Other model'])
  expect(effort!.disabled).toBe(true)
  // A chosen provider narrows its own model select, while the other roles keep the grouped full list.
  await pick('aligner', 'provider', 'worker-provider')
  expect(optionText(selects('aligner')[1]!)).toEqual([zh.modelInherit, 'Worker model', 'Worker fast'])
  await pick('aligner', 'model', 'worker-fast')
  await pick('aligner', 'provider', '')
  // Picking a model names its provider and switches effort to that model's efforts.
  await pick('main', 'model', 'other-model')
  expect(provider!.value).toBe('other-provider')
  expect(optionText(model!)).toEqual([zh.modelInherit, 'Other model'])
  expect(optionText(effort!)).toEqual([zh.modelEffortDefault, 'Medium'])
  await pick('main', 'effort', 'medium')
  await click(zh.save)
  expect(server.settings.agents.main.model).toEqual({ provider: 'other-provider', model: 'other-model', reasoningEffort: 'medium' })
})

it('clears to the inherited model and keeps a saved model whose provider left the catalog', async () => {
  server.settings = { ...server.settings, agents: { ...server.settings.agents,
    main: { ...server.settings.agents.main, model: { provider: 'removed-provider', model: 'removed-model', reasoningEffort: 'deep' } } } }
  await open()
  await settle()
  const [provider, model, effort] = selects('main')
  // The removed provider, model and effort stay selected and visible, so a save cannot swap in another model.
  expect(provider!.value).toBe('removed-provider')
  expect(optionText(provider!)).toContain('removed-provider')
  expect(model!.value).toBe('removed-model')
  expect(optionText(model!)).toContain('removed-model')
  expect(effort!.value).toBe('deep')
  await click(switchOf('main', 'read_image'))
  await click(zh.save)
  expect(server.settings.agents.main.model).toEqual({ provider: 'removed-provider', model: 'removed-model',
    reasoningEffort: 'deep' })
  // Choosing the inherit option stores null, as an empty model always did.
  await pick('main', 'provider', '')
  expect(selects('main').map(select => select.value)).toEqual(['', '', ''])
  await click(zh.save)
  expect(server.settings.agents.main.model).toBeNull()
})

it('localizes a catalog failure, disables the model dropdowns, and still restores inheritance', async () => {
  server.settings = { ...server.settings, agents: { ...server.settings.agents,
    main: { ...server.settings.agents.main, model: { provider: 'worker-provider', model: 'worker-model' } } } }
  server.modelCatalogFailure = 'model host unreachable'
  await open()
  await settle()
  expect(text()).toContain(zh.modelCatalogError.replace('{error}', 'model host unreachable'))
  expect(selects('main').map(select => select.disabled)).toEqual([true, true, true])
  await click(find(zh.agentRestoreInherit, '[data-agent-role="main"] button'))
  await click(zh.save)
  expect(server.settings.agents.main.model).toBeNull()
})

it('keeps required tools fixed, toggles optional ones, and saves disabledTools in catalog order', async () => {
  await open()
  const bash = switchOf('main', 'bash')
  expect(bash.getAttribute('aria-checked')).toBe('true')
  expect((bash as HTMLButtonElement).disabled).toBe(true)
  expect(bash.closest('.dt-switch-row')?.textContent).toContain(zh.agentToolRequired)
  // A required tool is not a draft edit: clicking it changes nothing.
  await click(bash)
  expect(all('.dt-savebar')).toHaveLength(0)
  expect(switchOf('main', 'bash').getAttribute('aria-checked')).toBe('true')
  await click(switchOf('main', 'read_image'))
  expect(switchOf('main', 'read_image').getAttribute('aria-checked')).toBe('false')
  // Turning it back on removes it from the draft; off again is the state the save carries.
  await click(switchOf('main', 'read_image'))
  expect(switchOf('main', 'read_image').getAttribute('aria-checked')).toBe('true')
  await click(switchOf('main', 'read_image'))
  // Toggled in reverse catalog order, the save still lists the turned-off tools in the catalog's optional order.
  await click(switchOf('executor', 'skill'))
  await click(switchOf('executor', 'web_search'))
  await click(zh.save)
  const sent = server.requests.find(request => request.path === 'settings/agents' && request.method === 'PUT')!
  const { value, revision } = sent.body as { value: AgentsConfig; revision: number }
  expect(revision).toBe(0)
  expect(value.main.disabledTools).toEqual(['read_image'])
  expect(value.aligner.disabledTools).toEqual([])
  expect(value.executor.disabledTools).toEqual(['web_search', 'skill'])
  expect(server.settings.agents).toMatchObject({ main: { disabledTools: ['read_image'] },
    executor: { disabledTools: ['web_search', 'skill'] } })
})

it('keeps the draft and shows the conflict when another save changed the same Agent setting', async () => {
  await open()
  await pick('main', 'provider', 'worker-provider'); await pick('main', 'model', 'worker-model')
  server.settings = { ...server.settings, agents: { ...server.settings.agents,
    main: { ...server.settings.agents.main, model: { provider: 'remote-provider', model: 'remote-model' } } } }
  server.revisions.agents = 1
  await click(zh.save)
  expect(document.querySelector('.dt-savebar [role="alert"]')?.textContent).toBe(zh.saveConflict)
  expect(selects('main').map(select => select.value)).toEqual(['worker-provider', 'worker-model', ''])
  await click(zh.save)
  expect(server.settings.agents.main.model).toEqual({ provider: 'worker-provider', model: 'worker-model' })
})

it('shows the save bar only while the Agents block has edits', async () => {
  await open()
  expect(all('.dt-savebar')).toHaveLength(0)
  await click(switchOf('aligner', 'web_search'))
  expect(all('.dt-savebar')).toHaveLength(1)
  await click(zh.discard)
  expect(all('.dt-savebar')).toHaveLength(0)
})

it('lists an Agents save with its role, model and tool change lines', async () => {
  server.history = { current: 4, policyVersion: 'abcdef1234567890', items: [{ revision: 4, savedAt: '2026-09-22T00:00:00Z',
    source: 'panel', policyVersion: 'abcdef1234567890', policyChanged: false, notified: [], block: 'agents',
    changes: [{ code: 'agentExecutorModel' }, { code: 'agentMainTools', from: '', to: 'read_image' },
      { code: 'agentAlignerTools', from: 'web_search', to: '' }] }] }
  await open()
  await click(zh.configHistory)
  expect(text()).toContain(zh['change.agentExecutorModel'])
  expect(text()).toContain(zh['change.agentMainTools'].replace('{from}', zh.unsetValue).replace('{to}', 'read_image'))
  expect(text()).toContain(zh['change.agentAlignerTools'].replace('{from}', 'web_search').replace('{to}', zh.unsetValue))
})

it('shows the Agents group and its role copy in English', async () => {
  at({ page: 'settings', query: { group: 'agents' } })
  await mount(en)
  expect(current()).toBe(en['settingsGroup.agents'])
  expect(text()).toContain(en.agentsIntroShort)
  expect(all('[data-agent-role]').map(item => item.querySelector('.dt-block-title')?.textContent))
    .toEqual([en['agentRole.main'], en['agentRole.aligner'], en['agentRole.executor']])
  expect(text()).toContain(en.agentToolRequired)
})
