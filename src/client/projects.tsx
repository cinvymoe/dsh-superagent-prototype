/** Project bar above the page tabs and the standalone page that creates a local project. */
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Button, Icon } from './controls.tsx'
import { usePanel, usePanelData } from './provider.tsx'
import type { Route } from './route.ts'
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
    // A switch inside Discuss replaces the entry so browsing projects or leaving the create page does not grow the back stack.
    navigate({ page: 'discuss' }, route.page === 'discuss')
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
        tabIndex={item.id === current ? 0 : -1} className="dt-project-tab" onClick={() => select(item.id)}>{item.name}</button>)}
    </div>}
    {overflow && projects.length > 0 && <div ref={more} className="dt-project-more-wrap">
      <Button className="dt-project-more" aria-haspopup="menu" aria-expanded={open} icon={<Icon name="chevron-down" size={14} />}
        onClick={() => setOpen(!open)}>{t('project.more')}</Button>
      {open && <div className="dt-project-menu" role="menu" aria-label={t('project.menu')}>
        {projects.map(item => <button key={item.id} type="button" role="menuitemradio" aria-checked={item.id === current}
          className="dt-project-option" onClick={() => { setOpen(false); select(item.id) }}>
          <span>{item.name}</span><span className="dt-mono">{item.repository}</span>
        </button>)}
      </div>}
    </div>}
    <Button variant="primary" size="sm" className="dt-project-new" icon={<Icon name="plus" size={14} />}
      onClick={() => navigate({ page: 'discuss', create: true }, 'create' in route && route.create === true)}>{t('discuss.newProject')}</Button>
  </div>
}

/** Standalone page that creates a local project; Cancel or Back creates nothing and the new project becomes current. */
export function NewProjectPage() {
  const { t, call, notify, navigate, setProject } = usePanel()
  const { reloadProjects } = usePanelData()
  const [name, setName] = useState('')
  const [repository, setRepository] = useState('')
  const [worktreeRoot, setWorktreeRoot] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const cleanName = name.trim(), cleanRepository = repository.trim(), root = worktreeRoot.trim()
    if (busy || !cleanName || !cleanRepository) return
    setBusy(true)
    try {
      const { project } = await call('POST local/projects', { body: { name: cleanName, repository: cleanRepository,
        ...(root ? { worktreeRoot: root } : {}) } })
      await reloadProjects()
      setProject(project.id)
      navigate({ page: 'discuss' }, true)
    } catch (failure) {
      notify(errorText(failure))
    } finally {
      setBusy(false)
    }
  }
  return <>
    <PageHead title={t('discuss.newProject')} />
    <div className="dt-column">
      <form className="dt-card dt-form" onSubmit={event => { void submit(event) }}>
        <div className="dt-card-head"><span className="dt-card-title">{t('discuss.newProject')}</span></div>
        <input className="dt-text-input" value={name} maxLength={80} placeholder={t('discuss.projectName')}
          onChange={event => setName(event.target.value)} />
        <input className="dt-text-input" value={repository} maxLength={200} placeholder={t('discuss.projectRepository')}
          onChange={event => setRepository(event.target.value)} />
        <input className="dt-text-input dt-mono" value={worktreeRoot} maxLength={4096} placeholder={t('discuss.projectWorktreeRoot')}
          aria-label={t('discuss.projectWorktreeRoot')} spellCheck={false}
          onChange={event => setWorktreeRoot(event.target.value)} />
        <p className="dt-hint">{t('discuss.projectWorktreeRootHint')}</p>
        <div className="dt-actions">
          <Button type="submit" variant="primary" size="sm" disabled={busy || !name.trim() || !repository.trim()}>
            {t('discuss.createProject')}</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => navigate({ page: 'discuss' }, true)}>{t('cancel')}</Button>
        </div>
      </form>
    </div>
  </>
}
