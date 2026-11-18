/**
 * Settings → Projects: the page of the project the project bar has selected, holding its record and the Execution settings
 * it may override. Every project is its own page, so this group never lists what another project owns.
 */
import { useState, type FormEvent } from 'react'
import { projectRepositories, type LocalProjectView } from '../sources/local-format.ts'
import { Button, InfoTip, Switch } from './controls.tsx'
import type { SettingsView } from './api.ts'
import { SaveBar } from './draft.tsx'
import { ProjectFields, projectBody, projectDraft, projectReady, type ProjectDraft } from './projects.tsx'
import { usePanel, usePanelData } from './provider.tsx'
import { ModelField, useBlockDraft, useSettings } from './settings-kit.tsx'
import { errorText } from './text.ts'
import { Hint, Section } from './widgets.tsx'

/** The project settings group: the page of the project the bar has selected, never a list of every project. */
export function ProjectsSettings({ project }: { project?: string }) {
  const { t, project: selected } = usePanel()
  const { projects } = usePanelData()
  // A route naming a project wins so a bookmark opens it; the bar's selection is next, and its first project until one is picked.
  const current = projects.find(item => item.id === (project ?? selected)) ?? projects[0]
  if (!current) return <Hint>{t('projectsSettingsEmpty')}</Hint>
  return <ProjectSettings key={current.id} project={current} />
}

/** One project's own page: its stored record, then the Execution settings it overrides for itself. */
function ProjectSettings({ project }: { project: LocalProjectView }) {
  const { t, call, notify } = usePanel()
  const { reloadProjects } = usePanelData()
  const [draft, setDraft] = useState<ProjectDraft>(() => projectDraft(project))
  const [busy, setBusy] = useState(false)
  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (busy || !projectReady(draft)) return
    setBusy(true)
    try {
      await call('PUT local/projects/:id', { id: project.id, body: projectBody(draft) })
      await reloadProjects()
      notify(t('discuss.projectSaved'))
    } catch (failure) {
      notify(errorText(failure))
    } finally {
      setBusy(false)
    }
  }
  return <>
    <div className="dt-row-meta">
      <span className="dt-hint dt-mono">{projectRepositories(project)}</span>
    </div>
    {project.missingChain && <p className="dt-error dt-project-missing-chain">{t('discuss.projectChainMissing',
      { chain: project.missingChain })}</p>}
    <form className="dt-card dt-form" onSubmit={event => { void save(event) }}>
      <div className="dt-card-head"><span className="dt-card-title">{project.name}</span></div>
      {/* A project that owns no chain has nowhere to store a bot, so its page leaves the field out. */}
      <ProjectFields draft={draft} onChange={patch => setDraft({ ...draft, ...patch })} editing
        showBot={!!project.chain || project.codeRepository !== undefined} />
      <div className="dt-actions">
        <Button type="submit" variant="primary" size="sm" disabled={busy || !projectReady(draft)}>{t('discuss.saveProject')}</Button>
      </div>
    </form>
    <ProjectOverride project={project} />
  </>
}

/**
 * The `projects` settings block for this one project: the only two settings a project may override — its own pause and its
 * executor model. A project with no entry reads the global Execution settings unchanged, so removing the entry restores
 * inheritance rather than copying today's global value.
 */
function ProjectOverride({ project }: { project: LocalProjectView }) {
  const { t } = usePanel()
  const { blocks } = useSettings().settings
  const draft = useBlockDraft('projects', blocks.projects.value, blocks.projects.revision)
  const value = draft.value
  const override = value[project.id]
  const edit = (next: { paused?: boolean;
    executor?: { model: SettingsView['blocks']['executor']['value']['model'] } }) => {
    draft.edit({ ...value, [project.id]: { ...override, ...next } })
  }
  const reset = () => {
    const next = { ...value }
    delete next[project.id]
    draft.edit(next)
  }
  return <div className="dt-form dt-block" data-project-override={project.id}>
    <h2 className="dt-block-title">{t('projectOverrides')}<InfoTip text={t('projectOverridesHint')} /></h2>
    <div className="dt-switch-row">
      <div className="dt-field-head">{t('projectPaused')}</div>
      <Switch checked={override?.paused ?? false} label={`${t('projectPaused')} · ${project.name}`}
        onChange={paused => edit({ paused })} />
    </div>
    <Section title={t('projectOverrideModel')} hint={t('projectOverridesHint')}>
      <ModelField id={`dt-project-model-${project.id}`} value={override?.executor?.model ?? null}
        onChange={model => edit({ executor: { model } })} />
    </Section>
    {override !== undefined && <div className="dt-actions">
      <Button type="button" variant="ghost" size="sm" onClick={reset}>{t('projectInherit')}</Button>
    </div>}
    {/* Its own save, so saving the record above never rewrites the override and the other way around. */}
    <SaveBar {...draft} onDiscard={draft.discard} onSave={() => { void draft.submit() }} />
  </div>
}
