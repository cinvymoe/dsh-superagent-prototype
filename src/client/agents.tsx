/**
 * Agents settings group: the main Session, the aligner and the executor with the model each inherits and the tools each
 * may call, and the Executor's running load with a link to the concurrency setting.
 */
import type { AgentsConfig, AgentRole, RoleModel } from '../policy.ts'
import { roleModel } from '../agent-model.ts'
import type { SettingsView } from './api.ts'
import { Button, Icon, InfoTip, Switch, Tag } from './controls.tsx'
import { SaveBar } from './draft.tsx'
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
function ToolRow({ name, note, checked, disabled,
  onChange }: { name: string; note?: string; checked: boolean; disabled?: boolean; onChange: (next: boolean) => void }) {
  return <div className="dt-switch-row">
    <span className="dt-field-head">{name}{note && <Tag tone="quiet">{note}</Tag>}</span>
    <Switch checked={checked} label={name} disabled={disabled} onChange={onChange} />
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
  // Keep `disabledTools` in the catalog's optional order, so a save's diff is stable whatever order a person toggles in.
  const toggle = (role: AgentRole, tool: string, on: boolean, optional: readonly string[]) => {
    const off = new Set(value[role].disabledTools)
    if (on) off.delete(tool); else off.add(tool)
    edit(role, { disabledTools: optional.filter(name => off.has(name)) })
  }
  // An added tool follows the host's catalog order; one whose plugin the host no longer registers stays listed so a person
  // can remove it before the save that would refuse it.
  const addTool = (role: AgentRole, tool: string, catalog: readonly string[]) => {
    const added = value[role].addedTools
    edit(role, { addedTools: [...catalog.filter(name => added.includes(name) || name === tool),
      ...added.filter(name => !catalog.includes(name))] })
  }
  const removeTool = (role: AgentRole, tool: string) => edit(role, { addedTools: value[role].addedTools.filter(name => name !== tool) })
  return <div className="dt-form">
    <form className="dt-form" onSubmit={event => { void draft.submit(event) }}>
      <Fields disabled={draft.busy}>
        <Hint>{t('agentsIntroShort')}<InfoTip text={t('agentsIntro')} /></Hint>
        {agents.roles.map(({ role, required, optional, addableTools }: RoleCatalog) => {
          const added = value[role].addedTools
          const catalog = addableTools.map(tool => tool.name)
          const descriptions = new Map(addableTools.map(tool => [tool.name, tool.description]))
          const addedShown = [...catalog.filter(name => added.includes(name)), ...added.filter(name => !catalog.includes(name))]
          const addable = catalog.filter(name => !added.includes(name))
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
            <Section title={t('agentTools')} hint={t('agentToolsHint')}>
              {required.map(tool => <ToolRow key={tool} name={tool} note={t('agentToolRequired')} checked disabled
                onChange={() => {}} />)}
              {optional.map(tool => <ToolRow key={tool} name={tool} checked={!value[role].disabledTools.includes(tool)}
                onChange={next => toggle(role, tool, next, optional)} />)}
            </Section>
            {(catalog.length > 0 || addedShown.length > 0) && <Section title={t('agentPluginTools')} hint={t('agentPluginToolsHint')}>
              {addedShown.length > 0 && <>
                <div className="dt-subhead" data-plugin-group="added"><span className="dt-field-head">{t('agentPluginAdded')}</span>
                  <span className="dt-count">{addedShown.length}</span></div>
                {addedShown.map(tool => {
                  const description = descriptions.get(tool)
                  return <div key={tool} className="dt-switch-row" data-plugin-tool={tool} data-plugin-state="added">
                    <span className="dt-field-head">{tool}{description && <InfoTip text={description} />}
                      <Tag tone="quiet">{t('agentPluginAddedTag')}</Tag>
                      {!description && <Tag tone="warning">{t('agentPluginUnavailable')}</Tag>}</span>
                    <Button variant="ghost" size="sm" icon={<Icon name="trash" />}
                      aria-label={t('agentPluginRemoveLabel', { tool })} onClick={() => removeTool(role, tool)}>{t('agentPluginRemove')}</Button>
                  </div>
                })}
              </>}
              {addable.length > 0 ? <>
                <div className="dt-subhead" data-plugin-group="addable"><span className="dt-field-head">{t('agentPluginAvailable')}</span>
                  <span className="dt-count">{addable.length}</span></div>
                {addable.map(tool => <div key={tool} className="dt-switch-row" data-plugin-tool={tool} data-plugin-state="available">
                  <span className="dt-field-head">{tool}{descriptions.get(tool) && <InfoTip text={descriptions.get(tool)!} />}</span>
                  <Button variant="ghost" size="sm" icon={<Icon name="plus" />}
                    aria-label={t('agentPluginAddLabel', { tool })} onClick={() => addTool(role, tool, catalog)}>{t('agentPluginAdd')}</Button>
                </div>)}
              </> : <Hint>{addedShown.length > 0 ? t('agentPluginAllAdded') : t('agentPluginNone')}</Hint>}
            </Section>}
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
