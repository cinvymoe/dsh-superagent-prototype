// @vitest-environment jsdom
// The Agents settings group: role cards, inherited models, required tools and plugin switches, the Executor link, drafts and history.
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
const pluginRow = (role: string, plugin: string) => {
  const element = card(role).querySelector<HTMLElement>(`[data-agent-plugin="${plugin}"]`)
  if (!element) throw new Error(`No ${role} plugin ${plugin}`)
  return element
}
const pluginSwitch = (role: string, plugin: string) => pluginRow(role, plugin).querySelector<HTMLElement>('[role="switch"]')!
const toolSwitch = (role: string, tool: string) => {
  const element = card(role).querySelector<HTMLElement>(`[data-agent-tool="${tool}"] [role="switch"]`)
  if (!element) throw new Error(`No ${role} tool ${tool}`)
  return element
}
const pluginIds = (role: string) => all(`[data-agent-role="${role}"] [data-agent-plugin]`).map(item => item.getAttribute('data-agent-plugin'))

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

it('lists the three roles with required tools and plugin switches, and says subagents inherit the executor\'s plugins', async () => {
  await open()
  expect(all('[data-agent-role]').map(item => item.querySelector('.dt-block-title')?.textContent))
    .toEqual([zh['agentRole.main'], zh['agentRole.aligner'], zh['agentRole.executor']])
  expect(text()).toContain(zh.agentsIntroShort)
  expect(zh.agentsIntroShort).toContain('插件')
  expect(zh.agentsIntroShort).toContain('子代理')
  // A role offers only its applicable plugins, and every switch that is not a required tool belongs to a plugin row.
  expect(pluginIds('main')).toEqual(['image', 'billion-context', 'ask-user', 'present', 'web-fetch', 'fork-subagent'])
  expect(pluginIds('aligner')).toEqual(['image', 'web', 'skills', 'todo', 'subagents', 'ask-user', 'present', 'web-fetch', 'fork-subagent'])
  expect(pluginIds('executor')).toEqual(['image', 'web', 'skills', 'todo', 'subagents', 'ask-user', 'present', 'web-fetch', 'fork-subagent'])
  for (const role of ['main', 'aligner', 'executor']) {
    expect(all(`[data-agent-role="${role}"] [role="switch"]:not([disabled])`).every(item => !!item.closest('[data-agent-plugin]'))).toBe(true)
    expect(card(role).querySelector('[data-plugin-tool]')).toBeNull()
  }
  // The required row is read-only and shows the core tools the plugins cannot switch off.
  for (const tool of ['skill', 'bash', 'read']) expect((toolSwitch('main', tool) as HTMLButtonElement).disabled).toBe(true)
  expect(card('main').querySelector('[data-agent-tool="bash"]')?.textContent).toContain(zh.agentToolRequired)
  await click(toolSwitch('main', 'bash'))
  expect(all('.dt-savebar')).toHaveLength(0)
})

it('shows each plugin\'s tools and whether this host provides them', async () => {
  await open()
  expect(pluginRow('executor', 'web').getAttribute('data-plugin-state')).toBe('enabled')
  expect(pluginRow('executor', 'web').getAttribute('data-plugin-provided')).toBe('true')
  expect(pluginRow('executor', 'web').textContent).toContain(`${zh.agentPluginTools}: web_search, web_fetch`)
  // A preset group is always available; billion-context comes from a host plugin this fixture does not register.
  expect(pluginRow('main', 'billion-context').getAttribute('data-plugin-provided')).toBe('false')
  expect(pluginRow('main', 'billion-context').textContent).toContain(zh.agentPluginUnavailable)
  expect(pluginRow('main', 'billion-context').textContent).toContain(zh.agentPluginMissingTools.replace('{tools}', 'compress, decompress, search_context, acp_status, acp_cache, acp_read_original_image'))
  expect(pluginRow('main', 'image').getAttribute('data-plugin-provided')).toBe('true')
  await click(pluginSwitch('main', 'image'))
  expect(pluginRow('main', 'image').getAttribute('data-plugin-state')).toBe('disabled')
  expect(pluginRow('main', 'image').textContent).toContain(zh.agentPluginDisabled)
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
  await click(pluginSwitch('main', 'image'))
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

it('toggles plugins per role and saves enabledPlugins in catalog order', async () => {
  await open()
  const before = server.settings.agents.executor.enabledPlugins
  expect(before).toEqual(['image', 'web', 'skills', 'todo', 'subagents'])
  // Turning one plugin off removes only its tools' plugin id; turning it back on restores the catalog order.
  await click(pluginSwitch('executor', 'web'))
  expect(pluginSwitch('executor', 'web').getAttribute('aria-checked')).toBe('false')
  await click(pluginSwitch('executor', 'image'))
  await click(pluginSwitch('main', 'billion-context'))
  await click(zh.save)
  const sent = server.requests.find(request => request.path === 'settings/agents' && request.method === 'PUT')!
  const { value, revision } = sent.body as { value: AgentsConfig; revision: number }
  expect(revision).toBe(0)
  expect(value.executor.enabledPlugins).toEqual(['skills', 'todo', 'subagents'])
  expect(value.main.enabledPlugins).toEqual(['image'])
  expect(value.aligner.enabledPlugins).toEqual(['image', 'web', 'skills', 'todo', 'subagents'])
  expect(server.settings.agents).toMatchObject({ main: { enabledPlugins: ['image'] },
    executor: { enabledPlugins: ['skills', 'todo', 'subagents'] } })
  // A reloaded view keeps the saved switches; turning one back on keeps the catalog order rather than the click order.
  expect(pluginSwitch('executor', 'web').getAttribute('aria-checked')).toBe('false')
  await click(pluginSwitch('executor', 'web'))
  await click(zh.save)
  // The image plugin stays off from the first save; the re-enabled web plugin returns at its catalog position.
  expect(server.settings.agents.executor.enabledPlugins).toEqual(['web', 'skills', 'todo', 'subagents'])
})

it('shows only plugin switches, with no per-tool add list or optional tool switch', async () => {
  server.registeredTools = []
  await open()
  expect(document.querySelector('[data-plugin-tool]')).toBeNull()
  for (const role of ['main', 'aligner', 'executor']) expect(card(role).textContent).toContain(zh.agentPlugins)
})

it('keeps the plugin draft and shows the localized reason when a save enables an inapplicable plugin', async () => {
  // A stored block names a plugin that does not apply to its role: the panel offers no row for it, and a save refuses it.
  server.settings = { ...server.settings, agents: { ...server.settings.agents,
    main: { ...server.settings.agents.main, enabledPlugins: ['image', 'billion-context', 'web'] } } }
  await open()
  // Editing the model leaves the stored plugin list alone, so the invalid entry reaches the save.
  await pick('main', 'provider', 'worker-provider'); await pick('main', 'model', 'worker-model')
  await click(zh.save)
  expect(document.querySelector('.dt-savebar [role="alert"]')?.textContent)
    .toBe(zh['userError.agentsPluginRole'].replace('{role}', 'main').replace('{plugins}', 'web'))
  expect(selects('main')[0]!.value).toBe('worker-provider')
  expect(server.settings.agents.main.enabledPlugins).toContain('web')
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
  await click(pluginSwitch('aligner', 'web'))
  expect(all('.dt-savebar')).toHaveLength(1)
  await click(zh.discard)
  expect(all('.dt-savebar')).toHaveLength(0)
})

it('lists an Agents save with its role, model and plugin change lines', async () => {
  server.history = { current: 4, policyVersion: 'abcdef1234567890', items: [{ revision: 4, savedAt: '2026-09-22T00:00:00Z',
    source: 'panel', policyVersion: 'abcdef1234567890', policyChanged: false, notified: [], block: 'agents',
    changes: [{ code: 'agentExecutorModel' }, { code: 'agentMainPluginEnabled', items: ['image'] },
      { code: 'agentAlignerPluginDisabled', items: ['web'] }, { code: 'agentPluginAdded', items: ['extra'] }] }] }
  await open()
  await click(zh.configHistory)
  expect(text()).toContain(zh['change.agentExecutorModel'])
  expect(text()).toContain(zh['change.agentMainPluginEnabled'].replace('{items}', 'image'))
  expect(text()).toContain(zh['change.agentAlignerPluginDisabled'].replace('{items}', 'web'))
  expect(text()).toContain(zh['change.agentPluginAdded'].replace('{items}', 'extra'))
})

it('adds a custom plugin from an MCP suggestion, enables it and keeps it after a reload', async () => {
  await open()
  expect(text()).toContain(zh.agentCustomPluginsNone)
  await click(find(zh.agentAddPlugin, 'button'))
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!
  expect(dialog.textContent).toContain(zh.agentAddPluginTitle)
  // Each MCP server and shared prefix is offered as a group; the remaining tools are listed one by one.
  expect(all('[data-plugin-suggestion]').map(item => item.getAttribute('data-plugin-suggestion')))
    .toEqual(['mcp:magpie', 'family:feature_exec'])
  expect(dialog.querySelector('[data-plugin-suggestion="mcp:magpie"]')?.textContent).toContain('mcp__magpie__call_tool')
  expect(all('[data-plugin-candidate]').map(item => item.getAttribute('data-plugin-candidate')))
    .toEqual(['agent_teams_status', 'automation_create', 'feature_exec_advance', 'feature_exec_start',
      'mcp__magpie__call_tool', 'mcp__magpie__repos'])
  // One click takes the whole group and fills the blank name; the default scope is every role.
  await click(find(zh.agentPluginUseSuggestion, '[data-plugin-suggestion="mcp:magpie"] button'))
  expect(dialog.querySelector<HTMLInputElement>(`input[aria-label="${zh.agentPluginName}"]`)!.value).toBe('magpie')
  await click(find(zh.agentPluginAddConfirm, '[role="dialog"] button'))
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(document.querySelector('[data-custom-plugin="magpie"]')?.textContent).toContain('magpie')
  // A draft plugin is switchable on each applicable role before the save.
  await click(pluginSwitch('main', 'magpie'))
  await click(zh.save)
  expect(server.settings.agents.plugins.find(plugin => plugin.id === 'magpie')).toMatchObject({ name: 'magpie',
    tools: ['mcp__magpie__call_tool', 'mcp__magpie__repos'], roles: ['main', 'aligner', 'executor'] })
  expect(server.settings.agents.main.enabledPlugins).toContain('magpie')
  // A reload reads the stored plugin back from the catalog.
  await open()
  expect(document.querySelector('[data-custom-plugin="magpie"]')?.textContent).toContain('magpie')
  expect(pluginRow('main', 'magpie').getAttribute('data-plugin-state')).toBe('enabled')
})

it('confirms before deleting an enabled custom plugin and clears it from every role', async () => {
  await open()
  await click(find(zh.agentAddPlugin, 'button'))
  await click(find(zh.agentPluginUseSuggestion, '[data-plugin-suggestion="family:feature_exec"] button'))
  await click(find(zh.agentPluginAddConfirm, '[role="dialog"] button'))
  await click(pluginSwitch('executor', 'feature-exec'))
  await click(zh.save)
  await settle()
  expect(server.settings.agents.executor.enabledPlugins).toContain('feature-exec')
  await click(find(zh.agentPluginDeleteLabel.replace('{name}', 'feature_exec'), 'button'))
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(zh.agentPluginDeleteTitle)
  // Cancelling keeps the plugin; confirming removes it and its enable entries together.
  await click(find(zh.cancel, '[role="dialog"] button'))
  expect(document.querySelector('[data-custom-plugin="feature-exec"]')).not.toBeNull()
  await click(find(zh.agentPluginDeleteLabel.replace('{name}', 'feature_exec'), 'button'))
  await click(find(zh.confirm, '[role="dialog"] button'))
  await click(zh.save)
  expect(server.settings.agents.plugins.some(plugin => plugin.id === 'feature-exec')).toBe(false)
  expect(server.settings.agents.executor.enabledPlugins).not.toContain('feature-exec')
  await open()
  expect(document.querySelector('[data-custom-plugin]')).toBeNull()
  expect(pluginIds('executor')).not.toContain('feature-exec')
})

it('saves a plugin that declares a tool the host lacks and marks it unavailable', async () => {
  await open()
  await click(find(zh.agentAddPlugin, 'button'))
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!
  await type(dialog.querySelector<HTMLInputElement>(`input[aria-label="${zh.agentPluginName}"]`)!, 'Ghost tools')
  await type(dialog.querySelector<HTMLInputElement>(`input[aria-label="${zh.agentPluginExtraTools}"]`)!, 'ghost_tool')
  await click(find(zh.agentPluginAddConfirm, '[role="dialog"] button'))
  await click(zh.save)
  expect(server.settings.agents.plugins.find(plugin => plugin.id === 'ghost-tools')!.tools).toEqual(['ghost_tool'])
  expect(document.querySelector('[data-custom-plugin="ghost-tools"]')?.textContent).toContain(zh.agentPluginUnavailable)
  await open()
  // The declared name stays visible on each role row, marked and listed as one this host does not provide.
  const row = pluginRow('executor', 'ghost-tools')
  expect(row.textContent).toContain(zh.agentPluginUnavailable)
  expect(row.querySelector('[data-plugin-tools]')?.textContent).toContain('ghost_tool')
})

it('shows the Agents group and its role copy in English', async () => {
  at({ page: 'settings', query: { group: 'agents' } })
  await mount(en)
  expect(current()).toBe(en['settingsGroup.agents'])
  expect(text()).toContain(en.agentsIntroShort)
  expect(all('[data-agent-role]').map(item => item.querySelector('.dt-block-title')?.textContent))
    .toEqual([en['agentRole.main'], en['agentRole.aligner'], en['agentRole.executor']])
  expect(text()).toContain(en.agentRequiredTools)
  expect(text()).toContain(en.agentPlugins)
})
