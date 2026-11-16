/** Project bar above the page tabs and the standalone page that creates a local project. */
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Button, Icon } from './controls.tsx'
import { usePanel, usePanelData } from './provider.tsx'
import { settingsRoute, type Route } from './route.ts'
import { projectRepositories, type LocalProjectView } from '../sources/local-format.ts'
import { LIMITS } from '../limits.ts'
import { errorText } from './text.ts'
import { PageHead } from './widgets.tsx'

/**
 * One chip tab per local project, the More menu that keeps every project reachable when the strip overflows,
 * and the New project button that opens the standalone creation page.
 */
export function ProjectBar({ route }: { route: Route }) {
  const { t, navigate, project, setProject } = usePanel()
  const { projects } = usePanelData()
  const [open, setOpen] = useState(false)
  const [overflow, setOverflow] = useState(false)
  const strip = useRef<HTMLDivElement>(null)
  const more = useRef<HTMLDivElement>(null)
  // The first project is the current one until a tab or a created project names another.
  const current = (projects.find(item => item.id === project) ?? projects[0])?.id
  const measure = useCallback(() => {
    const element = strip.current
    if (!element) { setOverflow(false); return }
    setOverflow(element.scrollWidth > element.clientWidth + 1)
  }, [])
  // Observe the strip and each tab so a pane resize or a longer copy re-measures the overflow.
  useEffect(() => {
    measure()
    if (!strip.current || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(strip.current)
    for (const tab of strip.current.children) observer.observe(tab)
    return () => { observer.disconnect() }
  }, [measure, projects, current, t])
  // Keep the current chip visible when the route or the current project changes.
  useEffect(() => {
    strip.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
      ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [projects, current])
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => { if (!more.current?.contains(event.target as Node)) setOpen(false) }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      more.current?.querySelector<HTMLElement>('.dt-project-more')?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('pointerdown', onPointerDown); document.removeEventListener('keydown', onKeyDown) }
  }, [open])
  const select = useCallback((id: string) => {
    if (id === current) return
    setProject(id)
    // A switch on the discussions or requirement list keeps that tab; every other tab lands on the requirement list.
    // These switches replace the entry so browsing projects does not grow the back stack.
    if (route.page === 'discussions') navigate({ page: 'discussions' }, true)
    // A project's own settings page follows the selection, so switching projects stays on the page being edited.
    else if (route.page === 'settings' && route.query.group === 'projects') {
      navigate(settingsRoute('projects', { project: id }), true)
    }
    else if (route.page === 'requirements' && route.id === undefined && !route.create) {
      // The requirement list keeps its processing-status filter across projects.
      const filter = route.query?.filter ?? 'pending'
      navigate(filter === 'pending' ? { page: 'requirements' } : { page: 'requirements', query: { filter } }, true)
    }
    else navigate({ page: 'requirements' })
  }, [current, setProject, navigate, route])
  // Arrow keys, Home and End move the selection with the roving tab, as the page tabs do.
  const walk = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const index = Math.max(0, projects.findIndex(item => item.id === current))
    const steps: Record<string, number> = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: projects.length - 1 }
    const next = steps[event.key]
    if (next === undefined) return
    event.preventDefault()
    const target = projects[(next + projects.length) % projects.length]
    if (!target) return
    select(target.id)
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => strip.current
      ?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus())
  }
  return <div className="dt-project-bar">
    {projects.length > 0 && <div ref={strip} className="dt-project-strip" role="tablist" aria-label={t('discuss.projects')}
      onKeyDown={walk}>
      {projects.map(item => <button key={item.id} type="button" role="tab" aria-selected={item.id === current}
        tabIndex={item.id === current ? 0 : -1} className="dt-project-tab" title={item.missingChain
          ? t('discuss.projectChainMissing', { chain: item.missingChain }) : undefined}
        onClick={() => select(item.id)}>{item.name}{item.missingChain && <Icon name="alert" size={12} />}</button>)}
    </div>}
    {overflow && projects.length > 0 && <div ref={more} className="dt-project-more-wrap">
      <Button className="dt-project-more" aria-haspopup="menu" aria-expanded={open} icon={<Icon name="chevron-down" size={14} />}
        onClick={() => setOpen(!open)}>{t('project.more')}</Button>
      {open && <div className="dt-project-menu" role="menu" aria-label={t('project.menu')}>
        {projects.map(item => <button key={item.id} type="button" role="menuitemradio" aria-checked={item.id === current}
          className="dt-project-option" onClick={() => { setOpen(false); select(item.id) }}>
          <span>{item.name}</span><span className="dt-mono">{projectRepositories(item)}</span>
          {item.bot && <span className="dt-mono dt-project-bot">{t('discuss.projectBotAccount', { account: item.bot })}</span>}
          {item.missingChain && <span className="dt-error dt-project-missing-chain">{t('discuss.projectChainMissingShort',
            { chain: item.missingChain })}</span>}
        </button>)}
      </div>}
    </div>}
    <Button variant="primary" size="sm" className="dt-project-new" icon={<Icon name="plus" size={14} />}
      onClick={() => navigate({ page: 'requirements', create: true }, route.page === 'requirements'
        && (('create' in route && route.create === true) || ('edit' in route && route.edit !== undefined)))}>{t('discuss.newProject')}</Button>
  </div>
}

/** The project record as one editable draft, shared by the creation page and the project's own Settings page. */
export interface ProjectDraft {
  name: string; intake: string; code: string; root: string; prepare: string; blocked: string; bot: string
}
export const emptyProject: ProjectDraft = { name: '', intake: '', code: '', root: '', prepare: '', blocked: '', bot: '' }
/** The draft of a stored project; a legacy record keeps its single repository in both repository fields. */
export const projectDraft = (project: LocalProjectView): ProjectDraft => ({ name: project.name,
  intake: project.intakeRepository ?? project.codeRepository ?? project.repository ?? '',
  code: project.codeRepository ?? project.repository ?? '', root: project.worktreeRoot ?? '',
  prepare: project.prepare ?? '', blocked: (project.blockedCommands ?? []).join(' '), bot: project.cli ?? '' })
/** A filled draft as the routes take it: the stored form of every field, with the empty ones kept empty. */
export const projectBody = (draft: ProjectDraft) => ({ name: draft.name.trim(),
  intakeRepository: draft.intake.trim(), codeRepository: draft.code.trim(), worktreeRoot: draft.root.trim(),
  prepare: draft.prepare.trim(), blockedCommands: draft.blocked.split(/[\s,]+/).filter(Boolean), cli: draft.bot.trim() })

/**
 * The project fields, rendered by the creation page and by each project's own page under Settings → Projects. They hold no
 * state of their own, so both pages own their draft and their submit.
 */
export function ProjectFields({ draft, onChange, editing, showBot }: {
  draft: ProjectDraft; onChange: (patch: Partial<ProjectDraft>) => void; editing: boolean; showBot: boolean
}) {
  const { t } = usePanel()
  return <>
    <input className="dt-text-input" value={draft.name} maxLength={80} placeholder={t('discuss.projectName')}
      aria-label={t('discuss.projectName')} onChange={event => onChange({ name: event.target.value })} />
    <input className="dt-text-input" value={draft.intake} maxLength={200} placeholder={t('discuss.projectIntakeRepository')}
      aria-label={t('discuss.projectIntakeRepository')} onChange={event => onChange({ intake: event.target.value })} />
    <input className="dt-text-input" value={draft.code} maxLength={200} placeholder={t('discuss.projectCodeRepository')}
      aria-label={t('discuss.projectCodeRepository')} onChange={event => onChange({ code: event.target.value })} />
    <p className="dt-hint">{t('discuss.projectRepositories')}</p>
    <input className="dt-text-input dt-mono" value={draft.root} maxLength={4096} placeholder={t('discuss.projectWorktreeRoot')}
      aria-label={t('discuss.projectWorktreeRoot')} spellCheck={false}
      onChange={event => onChange({ root: event.target.value })} />
    <p className="dt-hint">{t('discuss.projectWorktreeRootHint')}</p>
    <textarea className="dt-textarea dt-mono" rows={2} value={draft.prepare} maxLength={LIMITS.prepareCommand} spellCheck={false}
      placeholder={t('discuss.projectPrepare')} aria-label={t('discuss.projectPrepare')}
      onChange={event => onChange({ prepare: event.target.value })} />
    <p className="dt-hint">{t('discuss.projectPrepareHint')}</p>
    <input className="dt-text-input dt-mono" value={draft.blocked} maxLength={4096} spellCheck={false}
      placeholder={t('discuss.projectBlockedCommands')} aria-label={t('discuss.projectBlockedCommands')}
      onChange={event => onChange({ blocked: event.target.value })} />
    <p className="dt-hint">{t('discuss.projectBlockedCommandsHint')}</p>
    {/* A project that owns no chain has nowhere to store a bot, so a project without one leaves the field out. */}
    {showBot && <>
      <input className="dt-text-input dt-mono" value={draft.bot} maxLength={4096} placeholder={t('discuss.projectBot')}
        aria-label={t('discuss.projectBot')} spellCheck={false} onChange={event => onChange({ bot: event.target.value })} />
      <p className="dt-hint">{t('discuss.projectBotHint')}</p>
    </>}
  </>
}

/** Why the project form cannot be submitted yet, empty when every required field is filled. */
export const projectReady = (draft: ProjectDraft): boolean => !!projectBody(draft).name
  && !!projectBody(draft).intakeRepository && !!projectBody(draft).codeRepository

/**
 * The standalone page that creates a local project. Editing a stored project lives in Settings → Projects, where each
 * project has its own page: its record fields and the Execution settings it may override. A new project opens on that page.
 */
export function ProjectFormPage() {
  const { t, call, notify, navigate, setProject } = usePanel()
  const { reloadProjects } = usePanelData()
  const [draft, setDraft] = useState(emptyProject)
  const [busy, setBusy] = useState(false)
  const body = projectBody(draft)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy || !projectReady(draft)) return
    setBusy(true)
    try {
      // Creation omits the values whose absence keeps the Execution setting, so an empty field stays unset rather than clear.
      const created = (await call('POST local/projects', { body: { name: body.name,
        intakeRepository: body.intakeRepository, codeRepository: body.codeRepository,
        ...(body.worktreeRoot ? { worktreeRoot: body.worktreeRoot } : {}),
        ...(body.prepare ? { prepare: body.prepare } : {}),
        ...(body.blockedCommands.length ? { blockedCommands: body.blockedCommands } : {}),
        ...(body.cli ? { cli: body.cli } : {}) } })).project
      await reloadProjects()
      setProject(created.id)
      // The new project opens on its own Settings page, which is where its settings live from now on.
      navigate(settingsRoute('projects', { project: created.id }), true)
    } catch (failure) {
      notify(errorText(failure))
    } finally {
      setBusy(false)
    }
  }
  const title = t('discuss.newProject')
  return <>
    <PageHead title={title} back={{ label: t('discuss.requirements'),
      onClick: () => navigate({ page: 'requirements' }, true) }} />
    <div className="dt-column">
      <form className="dt-card dt-form" onSubmit={event => { void submit(event) }}>
        <div className="dt-card-head"><span className="dt-card-title">{title}</span></div>
        <ProjectFields draft={draft} onChange={patch => setDraft({ ...draft, ...patch })} editing={false} showBot />
        <div className="dt-actions">
          <Button type="submit" variant="primary" size="sm" disabled={busy || !projectReady(draft)}>{t('discuss.createProject')}</Button>
          <Button type="button" variant="ghost" size="sm"
            onClick={() => navigate({ page: 'requirements' }, true)}>{t('cancel')}</Button>
        </div>
      </form>
    </div>
  </>
}
