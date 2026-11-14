/**
 * Agents settings group: the main Session, the aligner and the executor with the model each inherits and the plugins each
 * enables, the shared custom plugin catalog a person may add to and delete from, and the Executor's running load with a
 * link to the concurrency setting.
 */
import type { AgentPlugin, AgentsConfig, AgentRole, RoleModel } from '../policy.ts'
import { roleModel } from '../agent-model.ts'
import type { SettingsView } from './api.ts'
import type { AgentPluginCatalog, PluginSuggestion } from '../app/agent-tools.ts'
import { Button, Icon, InfoTip, Input, Modal, Switch, Tag } from './controls.tsx'
import { SaveBar } from './draft.tsx'
import type { DshSuperagentKey } from './locales.ts'
import { usePanel, usePanelData } from './provider.tsx'
import { settingsRoute } from './route.ts'
import { ConfigHistory, Fields, ModelField, useBlockDraft, useSettings } from './settings-kit.tsx'
import type { T } from './text.ts'
import { Hint, LabelValue, Section } from './widgets.tsx'
import { useState } from 'react'

type RoleCatalog = SettingsView['agents']['roles'][number]
type RoleConfig = AgentsConfig[AgentRole]
// Kept local so the client bundle never imports `policy.ts`, whose runtime graph reaches Node-only modules.
const ALL_ROLES: readonly AgentRole[] = ['main', 'aligner', 'executor']
/** One role's override, with its model cleared so `roleModel` answers what a blank field would inherit. */
function withoutOverride(agents: AgentsConfig, role: AgentRole): AgentsConfig {
  switch (role) {
    case 'main': return { ...agents, main: { ...agents.main, model: null } }
    case 'aligner': return { ...agents, aligner: { ...agents.aligner, model: null } }
    case 'executor': return { ...agents, executor: { ...agents.executor, model: null } }
  }
}
/** Replace one role's override, keeping the other two as they are. */
function withRole(agents: AgentsConfig, role: AgentRole, next: RoleConfig): AgentsConfig {
  switch (role) {
    case 'main': return { ...agents, main: next }
    case 'aligner': return { ...agents, aligner: next }
    case 'executor': return { ...agents, executor: next }
  }
}
/** Replace every role's config in one edit, for a change that removes a plugin from the whole block. */
function withRoles(agents: AgentsConfig, edit: (role: AgentRole, config: RoleConfig) => RoleConfig): AgentsConfig {
  return { ...agents, main: edit('main', agents.main), aligner: edit('aligner', agents.aligner), executor: edit('executor', agents.executor) }
}
/** A role's model as the panel shows it: `provider / model · effort`, or the DSH default inheriting copy. */
function modelText(t: T, model: RoleModel | null): string {
  return model ? `${model.provider} / ${model.model}${model.reasoningEffort ? ` · ${model.reasoningEffort}` : ''}`
    : t('agentInheritedDefault')
}
/** A built-in plugin's localized name or description, falling back to the definition's own text for a stored plugin. */
function pluginText(t: T, plugin: AgentPluginCatalog, field: 'name' | 'hint'): string {
  if (!plugin.builtIn) return field === 'name' ? plugin.name : plugin.description ?? ''
  const key = `agentPlugin${field === 'name' ? '' : 'Hint'}.${plugin.id}` as DshSuperagentKey
  const text = t(key)
  return text === key ? field === 'name' ? plugin.name : plugin.description ?? '' : text
}
/** A plugin id from a display name: a lower-case slug, unique in the block and starting with a letter. */
function pluginIdFor(name: string, taken: ReadonlySet<string>): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'plugin'
  const root = (/^[a-z]/.test(base) ? base : `p-${base}`).slice(0, 64)
  let id = root, index = 2
  while (taken.has(id)) id = `${root.slice(0, 60)}-${index++}`
  return id
}
/** A draft plugin as the catalog would offer it, so a newly added one shows its missing tools before it is saved. */
function draftPlugin(plugin: AgentPlugin, available: readonly string[]): AgentPluginCatalog {
  const tools = [...new Set(plugin.tools)]
  const missingTools = tools.filter(name => !available.includes(name))
  return { ...plugin, tools, roles: plugin.roles ?? [...ALL_ROLES], builtIn: false,
    provided: missingTools.length === 0, missingTools }
}
/** Role labels for a plugin's scope, in role order. */
function roleNames(t: T, roles: readonly AgentRole[]): string {
  return ALL_ROLES.filter(role => roles.includes(role)).map(role => t(`agentRole.${role}`)).join(', ')
}
function ToolRow({ name, note, required }: { name: string; note?: string; required?: boolean }) {
  return <div className="dt-switch-row" data-agent-tool={name}>
    <span className="dt-field-head">{name}{note && <Tag tone="quiet">{note}</Tag>}</span>
    <Switch checked label={name} disabled={required} onChange={() => {}} />
  </div>
}
/** The modal that turns host-tool suggestions or a hand-picked set into one stored plugin definition. */
function AddPluginDialog({ catalog, taken, onAdd, onClose }: {
  catalog: SettingsView['agents']; taken: ReadonlySet<string>
  onAdd: (plugin: AgentPlugin) => void; onClose: () => void
}) {
  const { t } = usePanel()
  const [name, setName] = useState('')
  const [chosen, setChosen] = useState<readonly string[]>([])
  const [roles, setRoles] = useState<readonly AgentRole[]>(ALL_ROLES)
  const [extra, setExtra] = useState('')
  const [error, setError] = useState<string>()
  // Every tool a person may choose, one row per name even when a suggestion group and the ungrouped list both name it.
  const descriptions = new Map<string, string>()
  for (const tool of [...catalog.suggestions.flatMap(entry => entry.tools), ...catalog.ungroupedTools]) {
    if (!descriptions.has(tool.name)) descriptions.set(tool.name, tool.description)
  }
  const choose = (tool: string, on: boolean) => setChosen(current => on ? [...current, tool] : current.filter(item => item !== tool))
  // One click fills the name when it is still blank and adds the whole group, which a person may prune afterwards.
  const useSuggestion = (suggestion: PluginSuggestion) => {
    if (!name.trim()) setName(suggestion.name)
    setChosen(current => [...new Set([...current, ...suggestion.tools.map(tool => tool.name)])])
  }
  const submit = () => {
    const tools = [...new Set([...chosen, ...extra.split(/[\s,]+/).filter(Boolean)])].sort()
    if (!name.trim()) { setError(t('agentPluginNameRequired')); return }
    if (roles.length === 0) { setError(t('agentPluginNoRoles')); return }
    if (tools.length === 0) { setError(t('agentPluginNoTools')); return }
    onAdd({ id: pluginIdFor(name.trim(), taken), name: name.trim(), tools, roles: [...roles] })
  }
  return <Modal open onClose={onClose} title={t('agentAddPluginTitle')} closeLabel={t('close')}
    footer={<><Button onClick={onClose}>{t('cancel')}</Button>
      <Button variant="primary" onClick={submit}>{t('agentPluginAddConfirm')}</Button></>}>
    <div className="dt-form">
      <label className="dt-field"><span className="dt-field-head">{t('agentPluginName')}</span>
        <Input value={name} maxLength={100} aria-label={t('agentPluginName')}
          onChange={event => { setName(event.target.value); setError(undefined) }} /></label>
      <div className="dt-subhead" data-plugin-roles><span className="dt-field-head">{t('agentPluginRoles')}</span></div>
      {ALL_ROLES.map(role => <div className="dt-switch-row" key={role} data-plugin-role={role}>
        <span className="dt-field-head">{t(`agentRole.${role}`)}</span>
        <Switch checked={roles.includes(role)} label={t(`agentRole.${role}`)}
          onChange={on => setRoles(current => on ? [...current, role] : current.filter(item => item !== role))} />
      </div>)}
      {catalog.suggestions.length > 0 && <div className="dt-subhead" data-plugin-suggestions>
        <span className="dt-field-head">{t('agentPluginSuggestions')}</span></div>}
      {catalog.suggestions.map(suggestion => <div className="dt-switch-row" key={`${suggestion.kind}:${suggestion.name}`}
        data-plugin-suggestion={`${suggestion.kind}:${suggestion.name}`}>
        <span className="dt-field-head">{suggestion.name}
          <Tag tone="quiet">{t(suggestion.kind === 'mcp' ? 'agentPluginSuggestionMcp' : 'agentPluginSuggestionFamily')}</Tag>
          <span className="dt-hint" data-plugin-suggestion-tools>{suggestion.tools.map(tool => tool.name).join(', ')}</span></span>
        <Button variant="ghost" size="sm" onClick={() => useSuggestion(suggestion)}>{t('agentPluginUseSuggestion')}</Button>
      </div>)}
      {descriptions.size > 0 && <div className="dt-subhead" data-plugin-candidates>
        <span className="dt-field-head">{t('agentPluginChooseTools')}</span></div>}
      {[...descriptions.keys()].sort().map(tool => <div className="dt-switch-row" key={tool} data-plugin-candidate={tool}>
        <span className="dt-field-head">{tool}{descriptions.get(tool) && <InfoTip text={descriptions.get(tool)!} />}</span>
        <Switch checked={chosen.includes(tool)} label={tool} onChange={on => choose(tool, on)} />
      </div>)}
      <label className="dt-field"><span className="dt-field-head">{t('agentPluginExtraTools')}</span>
        <Input value={extra} aria-label={t('agentPluginExtraTools')}
          onChange={event => { setExtra(event.target.value); setError(undefined) }} /></label>
      {error && <p role="alert">{error}</p>}
    </div>
  </Modal>
}
export function AgentsSettings() {
  const { t, navigate } = usePanel()
  const { settings } = useSettings()
  const { state } = usePanelData()
  const { blocks, agents } = settings
  const draft = useBlockDraft('agents', blocks.agents.value, blocks.agents.revision)
  const value = draft.value
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState<AgentPluginCatalog>()
  const edit = (role: AgentRole, next: Partial<RoleConfig>) => draft.edit(withRole(value, role, { ...value[role], ...next }))
  // Every role shows the model a blank field inherits, the same `roleModel` the runtime uses for new Sessions.
  const inherited = (role: AgentRole) => roleModel({ agents: withoutOverride(value, role), eval: blocks.eval.value,
    executor: blocks.executor.value }, role)
  // The saved catalog plus the draft's own plugins, so a plugin added or deleted here reacts before it is saved.
  const definitions = new Map(agents.plugins.map(plugin => [plugin.id, plugin]))
  for (const plugin of value.plugins) if (!definitions.has(plugin.id)) definitions.set(plugin.id, draftPlugin(plugin, agents.availableTools))
  // A plugin removed from the draft disappears from the role cards at once, while the built-ins and the draft's own
  // definitions are the only ids a save may name.
  const activeIds = new Set([...agents.plugins.filter(plugin => plugin.builtIn).map(plugin => plugin.id),
    ...value.plugins.map(plugin => plugin.id)])
  const applicable = (role: AgentRole) => {
    const saved = agents.roles.find(entry => entry.role === role)?.plugins ?? []
    const drafted = value.plugins.filter(plugin => (plugin.roles ?? ALL_ROLES).includes(role)).map(plugin => plugin.id)
    return [...new Set([...saved, ...drafted])].filter(id => definitions.has(id) && activeIds.has(id))
  }
  const taken = new Set([...definitions.keys(), ...value.plugins.map(plugin => plugin.id)])
  // Keep the enabled ids in the catalog's order, so a save's diff is stable whatever order a person toggles in.
  // Switching a capability on also switches on what it requires, so the panel never asks for a dependency by hand.
  const toggle = (role: AgentRole, plugin: string, on: boolean, catalog: readonly string[]) => {
    const enabled = new Set(value[role].enabledPlugins)
    if (on) {
      const pending = [plugin]
      while (pending.length > 0) {
        const id = pending.pop()!
        if (enabled.has(id)) continue
        enabled.add(id)
        for (const required of definitions.get(id)?.requires ?? []) pending.push(required)
      }
    } else enabled.delete(plugin)
    edit(role, { enabledPlugins: catalog.filter(id => enabled.has(id)) })
  }
  /** Take a plugin out of the catalog and out of every role's enabled list in one edit. */
  const remove = (id: string) => draft.edit({
    ...withRoles(value, (_role, config) => ({ ...config, enabledPlugins: config.enabledPlugins.filter(item => item !== id) })),
    plugins: value.plugins.filter(plugin => plugin.id !== id),
  })
  const requestDelete = (plugin: AgentPluginCatalog) => {
    // Only a plugin some role has switched on needs a confirmation, because deleting it also turns it off there.
    if (ALL_ROLES.some(role => value[role].enabledPlugins.includes(plugin.id))) setDeleting(plugin); else remove(plugin.id)
  }
  return <div className="dt-form">
    <form className="dt-form" onSubmit={event => { void draft.submit(event) }}>
      <Fields disabled={draft.busy}>
        <Hint>{t('agentsIntroShort')}<InfoTip text={t('agentsIntro')} /></Hint>
        <Section title={t('agentCustomPlugins')} hint={t('agentCustomPluginsHint')}>
          <p className="dt-flow"><Button variant="primary" size="sm" icon={<Icon name="plus" size={14} />}
            onClick={() => setAdding(true)}>{t('agentAddPlugin')}</Button></p>
          {value.plugins.length === 0 ? <Hint>{t('agentCustomPluginsNone')}</Hint> : value.plugins.map(plugin => {
            const definition = definitions.get(plugin.id)!
            const roles = definition.roles
            return <div key={plugin.id} className="dt-switch-row" data-custom-plugin={plugin.id}>
              <span className="dt-field-head">{plugin.name}<Tag tone="quiet">{t('agentPluginCustom')}</Tag>
                {definition.missingTools.length > 0 && <Tag tone="warning">{t('agentPluginUnavailable')}</Tag>}
                <span className="dt-hint" data-custom-plugin-meta>{t('agentPluginAppliesTo', { roles: roleNames(t, roles) })}
                  {' · '}{definition.tools.join(', ')}</span></span>
              <Button variant="ghost" size="sm" icon={<Icon name="trash" />}
                aria-label={t('agentPluginDeleteLabel', { name: plugin.name })}
                onClick={() => requestDelete(definition)}>{t('agentPluginDelete')}</Button>
            </div>
          })}
        </Section>
        {agents.roles.map(({ role, required }: RoleCatalog) => {
          const enabled = value[role].enabledPlugins
          const catalog = applicable(role)
          return <div key={role} className="dt-form dt-block" data-agent-role={role}>
            <h2 className="dt-block-title">{t(`agentRole.${role}`)}<InfoTip text={t(`agentRoleHint.${role}`)} /></h2>
            <Section title={t('agentModel')} hint={t('agentModelHint')}>
              <p className="dt-flow">
                <LabelValue label={t('agentInherited')} value={modelText(t, inherited(role))} />
                {value[role].model && <Button variant="ghost" size="sm"
                  onClick={() => edit(role, { model: null })}>{t('agentRestoreInherit')}</Button>}
              </p>
              <ModelField id={`dt-agent-${role}-model`} value={value[role].model} onChange={model => edit(role, { model })} />
            </Section>
            <Section title={t('agentRequiredTools')} hint={t('agentRequiredToolsHint')}>
              {required.map(tool => <ToolRow key={tool} name={tool} note={t('agentToolRequired')} required />)}
            </Section>
            <Section title={t('agentPlugins')} hint={t('agentPluginsHint')}>
              {catalog.length === 0 ? <Hint>{t('agentPluginsNone')}</Hint> : catalog.map(id => {
                const plugin = definitions.get(id)!
                const on = enabled.includes(id)
                const details = `${t('agentPluginTools')}: ${plugin.tools.join(', ')}`
                const missing = plugin.missingTools.length > 0 ? ` · ${t('agentPluginMissingTools', { tools: plugin.missingTools.join(', ') })}` : ''
                return <div key={id} className="dt-switch-row" data-agent-plugin={id}
                  data-plugin-state={on ? 'enabled' : 'disabled'} data-plugin-provided={plugin.provided ? 'true' : 'false'}>
                  <span className="dt-field-head">{pluginText(t, plugin, 'name')}
                    {!plugin.builtIn && <Tag tone="quiet">{t('agentPluginCustom')}</Tag>}
                    {plugin.providedBy === 'mount' && <Tag tone="quiet">{t('agentPluginMounted')}</Tag>}
                    {!on && <Tag tone="quiet">{t('agentPluginDisabled')}</Tag>}
                    {!plugin.provided && <Tag tone="warning">{t('agentPluginUnavailable')}</Tag>}
                    {pluginText(t, plugin, 'hint') && <InfoTip text={pluginText(t, plugin, 'hint')} />}
                    <span className="dt-hint" data-plugin-tools>{details}{missing}</span>
                  </span>
                  <Switch checked={on} label={pluginText(t, plugin, 'name')} onChange={next => toggle(role, id, next, catalog)} />
                </div>
              })}
            </Section>
            {role === 'executor' && state && <Section title={t('agentConcurrency')} hint={t('agentConcurrencyHint')}>
              <p className="dt-flow">
                <LabelValue label={t('executingLabel')} value={`${state.load.running} / ${state.load.maxWorkers}`} />
                <Button variant="ghost" size="sm"
                  onClick={() => navigate(settingsRoute('execution'))}>{t('agentChangeConcurrency')}</Button>
              </p>
            </Section>}
          </div>
        })}
      </Fields>
      <SaveBar {...draft} onDiscard={draft.discard} />
    </form>
    {adding && <AddPluginDialog catalog={agents} taken={taken} onAdd={plugin => { draft.edit({ ...value, plugins: [...value.plugins, plugin] }); setAdding(false) }}
      onClose={() => setAdding(false)} />}
    {deleting && <Modal open onClose={() => setDeleting(undefined)} title={t('agentPluginDeleteTitle')} closeLabel={t('close')}
      description={t('agentPluginDeleteConfirm', { name: deleting.name })}
      footer={<><Button onClick={() => setDeleting(undefined)}>{t('cancel')}</Button>
        <Button variant="primary" onClick={() => { remove(deleting.id); setDeleting(undefined) }}>{t('confirm')}</Button></>} />}
    <ConfigHistory blocks={['agents']} />
  </div>
}
