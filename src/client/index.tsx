/** Browser plugin entry point registering the sidebar icon, main management panel, and Plugin Manager config view. */
import { useCallback, useEffect, useRef } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { SidebarPanelIconOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { PluginConfigViewProps } from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { openKnownSession, SessionNavigationError } from '../navigation.ts'
import { currentSearch, panelRequested, standaloneRequested } from './route.ts'
import { App } from './app.tsx'
import { PluginConfig, usePageForm } from './deployment.tsx'
import { en, zh } from './locales.ts'
import type { T } from './text.ts'

type ClientContext = Context & { sessions: ISessions }
const NS = 'dshSuperagent'
const PANEL_ID = 'dsh-superagent' as MainPanelId
const ENTRY = 'dsh-superagent'

function HammerIcon({ size }: SidebarPanelIconOwnerProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M6 3.5h9l3.5 1.75v2.5L15 9.5H6a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1z" /><path d="M10 9.5v10.25a1.75 1.75 0 0 0 3.5 0V9.5" /><path d="M10 15.5h3.5" />
  </svg>
}

/** Mounted panel wrapper; cancels any pending Session navigation when a new one starts or the panel unmounts. */
function Mounted({ ctx, t }: { ctx: ClientContext; t: T }) {
  const pending = useRef<AbortController>(undefined)
  useEffect(() => () => { pending.current?.abort() }, [])
  // The standalone marker is set when the plugin loads, before the panel paints; leaving the panel for a Session drops
  // it, so the shell's own columns come back even though the plugin stays loaded.
  useEffect(() => () => { delete document.documentElement.dataset.dtStandalone }, [])
  const openSession = useCallback(async (id: string) => {
    pending.current?.abort()
    const request = new AbortController(); pending.current = request
    try {
      await openKnownSession(ctx.sessions, id as SessionId, target => { ctx.uiWorkspace.openSession(target) }, request.signal)
    } catch (error) {
      if (error instanceof SessionNavigationError) throw new Error(t(error.code === 'not-ready' ? 'sessionListNotReady' : 'sessionNotListed'))
      throw error
    }
  }, [ctx, t])
  const form = usePageForm(ctx.get('configForms')?.get<Record<string, unknown>>(ENTRY))
  // The shell projects its own product title, which keeps naming dsh while this panel is the page: name the panel
  // instead, and put the shell's title back when the panel goes away (a Session selection may have changed it since).
  useEffect(() => {
    const previous = document.title
    const label = t('title')
    const show = () => { document.title = label }
    show()
    const stop = ctx.layout.panelInfo.subscribe(() => { if (ctx.layout.panelInfo.getSnapshot().activePanelId === PANEL_ID) show() })
    return () => { stop(); if (document.title === label) document.title = previous }
  }, [ctx, t])
  return <App t={t} openSession={openSession} deploymentForm={form} />
}

export const inject = ['slots', 'locale', 'sessions', 'uiWorkspace', 'layout']
/** Registers the panel, sidebar icon, and Plugin Manager config view; `configForms` is optional (without it, machine settings are read-only). */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-superagent: dictionaries')
  // `standalone=1` is the title bar's own new-tab link: it marks the document so the stylesheet can drop the shell's
  // sidebar column, leaving the panel alone in the window instead of a page framed by dsh.
  if (standaloneRequested(currentSearch()) && typeof document !== 'undefined') {
    ctx.effect(() => {
      document.documentElement.dataset.dtStandalone = ''
      return () => { delete document.documentElement.dataset.dtStandalone }
    }, 'dsh-superagent: standalone page')
  }
  const t = ctx.locale.bind(NS)
  ctx.slots.inject('main', () => {
    const dispose = ctx.slots.register({ name: 'main', key: PANEL_ID, locale: NS, inject: () => ({}) },
      (props: { t: T }) => <Mounted ctx={ctx} t={props.t} />)
    // Selecting after the registration makes the key visible to the layout; a URL that does not name this panel leaves
    // the shell's own choice (the Conversation) untouched, and a panel already selected is left alone.
    if (panelRequested(currentSearch()) && ctx.layout.panelInfo.getSnapshot().activePanelId !== PANEL_ID) {
      ctx.layout.selectPanel(PANEL_ID)
    }
    return dispose
  })
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 10, label: () => t('panel'), locale: NS }, HammerIcon))
  ctx.slots.inject('plugins.row.config', () => ctx.slots.register({ name: 'plugins.row.config', key: `${ENTRY}#${ENTRY}`, locale: NS },
    (props: PluginConfigViewProps & { t: T }) => <PluginConfig t={props.t} view={props.view} form={props.form} />))
}
