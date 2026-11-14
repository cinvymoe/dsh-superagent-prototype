/**
 * Agents settings group: the main Session, the aligner and the executor with the model each inherits and the plugins each
 * enables, and the Executor's running load with a link to the concurrency setting.
 */
import type { AgentsConfig, AgentRole, RoleModel } from '../policy.ts'
import { roleModel } from '../agent-model.ts'
import type { SettingsView } from './api.ts'
import type { AgentPluginCatalog } from '../app/agent-tools.ts'
import { Button, InfoTip, Switch, Tag } from './controls.tsx'
import { SaveBar } from './draft.tsx'
import type { DshSuperagentKey } from './locales.ts'
import { usePanel, usePanelData } from './provider.tsx'
import { settingsRoute } from './route.ts'
import { ConfigHistory, Fields, ModelField, useBlockDraft, useSettings } from './settings-kit.tsx'
import type { T } from './text.ts'
import { Hint, LabelValue, Section } from './widgets.tsx'

type RoleCatalog = SettingsView['agents']['roles'][number]
type RoleConfig = AgentsConfig[AgentRole]
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
function ToolRow({ name, note, required }: { name: string; note?: string; required?: boolean }) {
  return <div className="dt-switch-row" data-agent-tool={name}>
    <span className="dt-field-head">{name}{note && <Tag tone="quiet">{note}</Tag>}</span>
    <Switch checked label={name} disabled={required} onChange={() => {}} />
  </div>
}
export function AgentsSettings() {
  const { t, navigate } = usePanel()
  const { settings } = useSettings()
  const { state } = usePanelData()
  const { blocks, agents } = settings
  const draft = useBlockDraft('agents', blocks.agents.value, blocks.agents.revision)
  const value = draft.value
  const edit = (role: AgentRole, next: Partial<RoleConfig>) => draft.edit(withRole(value, role, { ...value[role], ...next }))
  // Every role shows the model a blank field inherits, the same `roleModel` the runtime uses for new Sessions.
  const inherited = (role: AgentRole) => roleModel({ agents: withoutOverride(value, role), eval: blocks.eval.value,
    executor: blocks.executor.value }, role)
  const plugins = new Map(agents.plugins.map(plugin => [plugin.id, plugin]))
  // Keep the enabled ids in the catalog's order, so a save's diff is stable whatever order a person toggles in.
  const toggle = (role: AgentRole, plugin: string, on: boolean, catalog: readonly string[]) => {
    const enabled = new Set(value[role].enabledPlugins)
    if (on) enabled.add(plugin); else enabled.delete(plugin)
    edit(role, { enabledPlugins: catalog.filter(id => enabled.has(id)) })
  }
  return <div className="dt-form">
    <form className="dt-form" onSubmit={event => { void draft.submit(event) }}>
      <Fields disabled={draft.busy}>
        <Hint>{t('agentsIntroShort')}<InfoTip text={t('agentsIntro')} /></Hint>
        {agents.roles.map(({ role, required, plugins: applicable }: RoleCatalog) => {
          const enabled = value[role].enabledPlugins
          const catalog = applicable.filter(id => plugins.has(id))
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
                const plugin = plugins.get(id)!
                const on = enabled.includes(id)
                const details = `${t('agentPluginTools')}: ${plugin.tools.join(', ')}`
                const missing = plugin.missingTools.length > 0 ? ` · ${t('agentPluginMissingTools', { tools: plugin.missingTools.join(', ') })}` : ''
                return <div key={id} className="dt-switch-row" data-agent-plugin={id}
                  data-plugin-state={on ? 'enabled' : 'disabled'} data-plugin-provided={plugin.provided ? 'true' : 'false'}>
                  <span className="dt-field-head">{pluginText(t, plugin, 'name')}
                    {!plugin.builtIn && <Tag tone="quiet">{t('agentPluginCustom')}</Tag>}
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
    <ConfigHistory blocks={['agents']} />
  </div>
}
