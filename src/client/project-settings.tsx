/** Settings → Projects: the list of projects, and each project's own page holding its record and the Execution settings it may override. */
import { useState, type FormEvent } from 'react'
import { projectRepositories, type LocalProjectView } from '../sources/local-format.ts'
import { Button, InfoTip, Switch } from './controls.tsx'
import type { SettingsView } from './api.ts'
import { SaveBar } from './draft.tsx'
import { ProjectFields, projectBody, projectDraft, projectReady, type ProjectDraft } from './projects.tsx'
import { usePanel, usePanelData } from './provider.tsx'
import { settingsRoute } from './route.ts'
import { ModelField, useBlockDraft, useSettings } from './settings-kit.tsx'
import { errorText } from './text.ts'
import { Hint, Section } from './widgets.tsx'

/** The project settings group: its index, or the page of the project the route names. */
export function ProjectsSettings({ project }: { project?: string }) {
  const { t } = usePanel()
  const { projects } = usePanelData()
  const current = project === undefined ? undefined : projects.find(item => item.id === project)
  if (project === undefined) return <ProjectsIndex />
  // A project named by a bookmark may be gone; the list is still the page to land on rather than an error.
  return current ? <ProjectSettings key={current.id} project={current} /> : <Hint>{t('loading')}</Hint>
}

/** One row per project; each row opens that project's own page. */
function ProjectsIndex() {
  const { t, navigate } = usePanel()
  const { projects } = usePanelData()
  if (!projects.length) return <Hint>{t('projectsSettingsEmpty')}</Hint>
  return <div className="dt-form dt-block">
    <p className="dt-hint">{t('projectsSettingsHint')}</p>
    <ul className="dt-list">{projects.map(item => <li key={item.id} className="dt-row-meta" data-project={item.id}>
      <button type="button" className="dt-textlink" onClick={() => navigate(settingsRoute('projects', { project: item.id }), true)}>
        {item.name}</button>
      <span className="dt-hint dt-mono">{projectRepositories(item)}</span>
      {item.missingChain && <span className="dt-hint">{t('discuss.projectChainMissing', { chain: item.missingChain })}</span>}
    </li>)}</ul>
  </div>
}

/** One project's own page: its stored record, then the Execution settings it overrides for itself. */
function ProjectSettings({ project }: { project: LocalProjectView }) {
  const { t, call, notify, navigate } = usePanel()
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
      <button type="button" className="dt-textlink" onClick={() => navigate(settingsRoute('projects'), true)}>
        {t('settingsGroup.projects')}</button>
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
