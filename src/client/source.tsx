/** Source status view (health, filtered Triggers, dropped replies) and Source settings cards. */
import { useEffect, useState } from 'react'
import type { FieldSpec } from '../sources/kind.ts'
import { projectChain, type LocalProjectView } from '../sources/local-format.ts'
import { usePoll, type DroppedReply, type SourceStatusRow, type SourceView } from './api.ts'
import { DisclosureRow, Dot, Icon, InfoTip, Switch, Tag } from './controls.tsx'
import { SaveBar } from './draft.tsx'
import { sourceMark } from './marks.ts'
import { useCurrentProject, usePanel, usePanelData } from './provider.tsx'
import { setupPage, settingsRoute, type Route } from './route.ts'
import { ConfigHistory, Fields, SourceField, useBlockDraft, useSettings } from './settings-kit.tsx'
import { actorName, healthText, localized, readableMarkers, reasonLabel, valueLabel, when } from './text.ts'
import { CheckSetupButton, Hint, LabelValue, LoadState, SetupMessage, StatusHead, When } from './widgets.tsx'

type ChainRow = Record<string, string>
/**
 * Repository chains are project configuration: the card shows the current project's chain plus any chain no project
 * owns, and every other row is carried through a save untouched so one project never rewrites another's.
 */
function chainScope(field: FieldSpec, config: unknown, saved: unknown, projects: LocalProjectView[], current?: LocalProjectView) {
  if (field.type !== 'rows') return undefined
  const column = field.columns[0]!.key
  const rows = (input: unknown) => (Array.isArray(input) ? input as ChainRow[] : [])
  const elsewhere = (row: ChainRow) => projects.some(project => projectChain(project) === row[column] && project.id !== current?.id)
  /** Swap the visible rows back into place, leaving another project's rows exactly where they are. */
  const merge = (next: unknown): ChainRow[] => {
    const edited = rows(next)
    const kept = rows(config).flatMap(row => {
      if (elsewhere(row)) return [row]
      const replacement = edited.shift()
      return replacement ? [replacement] : []
    })
    return [...kept, ...edited]
  }
  return { value: rows(config).filter(row => !elsewhere(row)), saved: rows(saved).filter(row => !elsewhere(row)), merge }
}

function SourceCard({ source }: { source: SourceView }) {
  const { t, call } = usePanel()
  const { running, projects } = usePanelData()
  const current = useCurrentProject()
  const { reload } = useSettings()
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const refreshLabels = async () => { const { added } = await call('POST sources/:id/labels',
    { id: source.id }); await reload(); return added }
  const draft = useBlockDraft(`source:${source.id}`, source.value, source.revision)
  const value = draft.value
  const { problem, value: saved } = source
  const changed = (key: string) => String(value.config[key] ?? '') !== String(saved.config[key] ?? '')
  // Saving a modified setup-sensitive field restarts dsh-superagent, interrupting running Assignments.
  const restarts = draft.dirty && source.restarts.some(changed)
  const description = localized(t, source.description)
  // Hide derived facts for unsaved field edits until the new value is saved.
  const field = (spec: FieldSpec) => {
    const scope = spec.scoped === 'project' ? chainScope(spec, value.config[spec.key], saved.config[spec.key], projects,
      current) : undefined
    const write = scope
      ? (next: unknown) => draft.edit({ ...value, config: { ...value.config, [spec.key]: scope.merge(next) } })
      : (next: unknown) => draft.edit({ ...value, config: { ...value.config, [spec.key]: next } })
    return <SourceField key={spec.key} field={spec} value={scope ? scope.value : value.config[spec.key]}
      saved={scope ? scope.saved : saved.config[spec.key]} labels={source.labels}
      refreshLabels={refreshLabels} fact={spec.type === 'fact' || !changed(spec.key) ? source.facts[spec.key] : undefined}
      onChange={write} />
  }
  const advanced = source.fields.filter(spec => spec.advanced)
  return <form id={`dt-source-${source.id}`} className="dt-card" onSubmit={event => { void draft.submit(event) }}>
    <Fields disabled={draft.busy}>
      <div className="dt-card-head">
        <div className="dt-row-main">
          <div className="dt-row-title">
            <span className="dt-card-title">{localized(t, source.title)}</span>{description && <InfoTip text={description} />}
            {!source.installed && <Tag tone="warning">{t('sourceNotInstalled')}</Tag>}
          </div>
        </div>
        {source.installed && <Switch checked={value.enabled} onChange={enabled => draft.edit({ ...value, enabled })}
          label={t('sourceEnable', { name: localized(t, source.title) })} />}
      </div>
      {problem && <div className="dt-row-buttons">
        <p className="dt-error" role="status"><SetupMessage problem={problem} lead /></p><CheckSetupButton />
      </div>}
      {!source.installed && <Hint>{t('sourceNotInstalledHint')}</Hint>}
      {source.installed && source.fields.filter(spec => !spec.advanced).map(field)}
      {source.installed && advanced.length > 0 && <DisclosureRow icon={<Icon name="settings" />} title={t('advanced')} open={advancedOpen}
        onToggle={() => setAdvancedOpen(!advancedOpen)}>
        <div className="dt-disclosure-body">{advanced.map(field)}</div>
      </DisclosureRow>}
    </Fields>
    <SaveBar {...draft} status={restarts && running > 0 ? t('restartInterrupts', { count: running }) : undefined}
      onDiscard={draft.discard} />
  </form>
}

export function SourceSettings({ focus }: { focus?: string }) {
  const { sources } = useSettings().settings
  useEffect(() => { if (focus) document.getElementById(`dt-source-${focus}`)?.scrollIntoView?.({ block: 'start' }) }, [focus])
  return <div className="dt-form">
    {sources.map(source => <SourceCard key={source.id} source={source} />)}
    <ConfigHistory blocks={['source:']} />
  </div>
}

function DroppedReplies({ items }: { items: DroppedReply[] }) {
  const { t, navigate } = usePanel()
  const [open, setOpen] = useState(false)
  // Link to the message's Ticket, or fall back to its Thread for messages queued before receipts recorded `ticketId`.
  const target = (item: DroppedReply): { route: Route; name: string } | undefined => item.ticket
    ? { route: { page: 'execution', id: item.ticket.id }, name: item.ticket.title }
    : item.thread ? { route: { page: 'trigger', id: item.thread }, name: t('term.thread') } : undefined
  return <DisclosureRow icon={<Icon name="dismiss" />} title={<>{t('sourceDroppedTitle')} <span
    className="dt-count">{items.length}</span></>} open={open}
    onToggle={() => setOpen(!open)}>
    <div className="dt-disclosure-body">
      <Hint>{t('sourceDroppedHint')}</Hint>
      <ul className="dt-list">{items.map(item => {
        const link = target(item)
        return <li key={item.id} className="dt-row"><Dot state="idle" /><div className="dt-row-main">
          <div className="dt-row-title dt-line">{readableMarkers(t, item.preview) || t('empty')}</div>
          <div className="dt-row-meta">
            <Tag tone="neutral">{reasonLabel(t, item.dropped.reason)}</Tag><When at={item.dropped.at} />
            {link && <button type="button" className="dt-textlink" onClick={() => navigate(link.route)}>{link.name}</button>}
          </div>
        </div></li>
      })}</ul>
    </div>
  </DisclosureRow>
}
function SourceRow({ source }: { source: SourceStatusRow }) {
  const { t, navigate } = usePanel()
  const { setup } = usePanelData()
  const [filteredOpen, setFilteredOpen] = useState(false)
  const { problem, dropped } = source
  const { dot, label: state } = sourceMark(t, source.state)
  const { received, filtered, lastAt } = source.stats
  // Omit healthy parts and suppress per-part notes when a setup problem already explains why the Source is stopped.
  const notes = source.enabled && !problem && !setup?.problem ? source.health.filter(item => item.state === 'error'
    || item.state === 'paused') : []
  return <li className="dt-row">
    <Dot state={dot} label={state} />
    <div className="dt-row-main">
      <div className="dt-row-title"><span className="dt-row-name">{localized(t, source.title)}</span><span className="dt-status-text"
        data-state={dot}>{state}</span></div>
      <div className="dt-row-meta">
        {received > 0 && <LabelValue label={t('sourceReceivedLabel')}
          value={received} />}{filtered > 0 && <LabelValue label={t('sourceFilteredLabel')} value={filtered} />}
        {lastAt && <LabelValue label={t('sourceLatestLabel')} value={when(lastAt, t('lang'))} />}
      </div>
      {problem && <p className="dt-error">
        <SetupMessage problem={problem} lead /> <button type="button" className="dt-textlink"
          onClick={() => navigate(settingsRoute('source', { source: source.id }))}>
          {t('sourceOpenSettings')}
        </button>
      </p>}
      {notes.map(item => <p key={item.name} className={item.state === 'error' ? 'dt-error dt-clamp' : 'dt-hint dt-clamp'}>
        {valueLabel(t, 'health', item.name)}{t('labelSeparator')}<span className={item.code ? undefined : 'dt-mono'}>{healthText(t,
          item)}</span>
      </p>)}
      {source.filtered.length > 0 && <DisclosureRow icon={<Icon name="filter" />} title={t('sourceFilteredTitle')} open={filteredOpen}
        onToggle={() => setFilteredOpen(!filteredOpen)}>
        <div className="dt-disclosure-body">
          <ul className="dt-list">{source.filtered.map(item => <li key={item.id} className="dt-row"><Dot state="idle" /><div
            className="dt-row-main">
            <div className="dt-row-title">{actorName(t, item.actor)}{t('labelSeparator')}{readableMarkers(t, item.preview)
              || t('empty')}</div>
            <div className="dt-row-meta"><Tag tone="neutral">{reasonLabel(t, item.reason)}</Tag><When at={item.at} /></div>
          </div></li>)}</ul>
        </div>
      </DisclosureRow>}
      {dropped.length > 0 && <DroppedReplies items={dropped} />}
    </div>
  </li>
}

export function SourceStatus() {
  const { t, call, navigate } = usePanel()
  const { setup } = usePanelData()
  const { data, error } = usePoll(() => call('GET sources'), [])
  // Global deployment setup problems halt all Sources and show at the top; Source-specific setup problems show on that Source's row.
  const elsewhere = setup?.problem?.place === 'deployment' ? setup.problem : undefined
  return <div className="dt-form">
    <StatusHead hint={t('sourceStatusIntro')} settings="source" />
    {elsewhere && <p className="dt-error">
      <SetupMessage problem={elsewhere} lead /> <button type="button" className="dt-textlink"
        onClick={() => navigate(setupPage(elsewhere.place))}>{t('setupFixLink')}</button>
    </p>}
    <LoadState error={error} loading={!data} />
    {data && <ul className="dt-list">{data.map(source => <SourceRow key={source.id} source={source} />)}</ul>}
  </div>
}
