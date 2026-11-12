/**
 * Deployment settings view shared between the panel Settings tab and the DSH Plugin Manager config page.
 * Edits host-level plugin configuration limits through DSH `ConfigForm` when writable.
 */
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ConfigPageForm } from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import { LIMITS } from '../limits.ts'
import { ApiError, usePoll, type SetupView } from './api.ts'
import { Button, InfoTip, Input } from './controls.tsx'
import { SaveBar, useDraft } from './draft.tsx'
import { PanelProvider, usePanel, usePanelData } from './provider.tsx'
import { Field, Fields } from './settings-kit.tsx'
import { errorText, setupText, type T } from './text.ts'
import { CheckSetupButton, ConfirmButton, Hint, KeyValues, Section, SetupMessage, When } from './widgets.tsx'

export type DeploymentForm = ConfigPageForm | undefined
type Op = Parameters<ConfigPageForm['mutate']>[0][number]

const MACHINE_LIMITS = ['promptMaxChars', 'admissionContextMaxPages', 'admissionContextTimeoutMs'] as const
type Limits = Record<typeof MACHINE_LIMITS[number], string>
const text = (value: unknown): string => typeof value === 'string' || typeof value === 'number' ? String(value) : ''
const limitsOf = (values: object | undefined): Limits =>
  Object.fromEntries(MACHINE_LIMITS.map(key => [key, text((values as Record<string, unknown> | undefined)?.[key])])) as Limits

export function usePageForm(form: ConfigForm<Record<string, unknown>> | undefined): DeploymentForm {
  const subscribe = useCallback((listener: () => void) => form ? form.subscribe(listener) : () => {}, [form])
  const state = useSyncExternalStore(subscribe, () => form?.getSnapshot())
  return useMemo(() => form && state ? { state, mutate: form.mutate.bind(form) } : undefined, [form, state])
}

/**
 * The running checkout, read-only, with the pull-and-build action the service script performs; the same section serves the
 * Settings tab and the Plugin Manager page, and only covers the child once setup resolved, since no chain names it before.
 */
function LocalCheckoutSection({ setup, t }: { setup: SetupView; t: T }) {
  return <Section title={t('deploymentCheckout')} hint={t('deploymentCheckoutHint')}>
    {setup.accounts === null ? <Hint>{t('deploymentCheckoutWaiting')}</Hint> : <LocalCheckout t={t} />}
  </Section>
}

/** The checkout's facts, its reasons when it cannot take a merge, and the confirmation that runs the one merge at a time. */
function LocalCheckout({ t }: { t: T }) {
  const { call, notify } = usePanel()
  const { data: status, error, reload } = usePoll(() => call('GET deployment/prepare'), [call])
  const [failure, setFailure] = useState<{ message: string; log: string }>()
  const [busy, setBusy] = useState(false)
  const merge = async (): Promise<void> => {
    // The confirmation already guards re-entry; this keeps a second caller from starting another merge.
    if (busy) return
    setBusy(true)
    try {
      const result = await call('POST deployment/prepare')
      setFailure(undefined)
      notify(result.merged ? t('deploymentCheckoutMerged') : t('deploymentCheckoutCurrent'))
      await reload()
    } catch (error) {
      // The host's refusal carries the script's output tail and the log an operator reads; the page stays as it is.
      const values = error instanceof ApiError ? error.details.user?.values : undefined
      setFailure({ message: values?.message ?? errorText(error), log: values?.log ?? '' })
    } finally { setBusy(false) }
  }
  if (!status) return error ? <p className="dt-error" role="alert">{error.message}</p> : <Hint>{t('loading')}</Hint>
  const { checkout, reasons } = status
  const head = checkout.head === null ? t('empty')
    : <><code className="dt-mono" title={checkout.head}>{checkout.head.slice(0, 7)}</code>{' '}
      <When at={checkout.committedAt ?? undefined} /></>
  const reasonsText = reasons.map(reason => t(`checkoutReason.${reason}`)).join(t('listSeparator'))
  const action = status.available
    ? status.running ? <Button variant="outline" size="sm" disabled>{t('deploymentCheckoutBusy')}</Button>
      : <ConfirmButton label={t('deploymentCheckoutAction')} title={t('deploymentCheckoutActionTitle')}
        message={t('deploymentCheckoutConfirm', { repository: status.repository ?? '' })} variant="outline" icon="refresh"
        onConfirm={merge} />
    : <Button variant="outline" size="sm" disabled>{t('deploymentCheckoutAction')}</Button>
  return <>
    <KeyValues rows={[
      [t('deploymentCheckoutPath'), <span className="dt-mono">{checkout.path}</span>],
      [t('deploymentCheckoutBranch'), checkout.branch ?? t('empty')],
      [t('deploymentCheckoutCommit'), head],
      [t('deploymentCheckoutTree'), checkout.dirty ? t('deploymentCheckoutDirty') : t('deploymentCheckoutClean')],
      [t('deploymentCheckoutChain'), status.repository ?? t('empty')],
    ]} />
    {checkout.restartRequired && <p><span className="dt-tag" data-tone="warning">{t('deploymentCheckoutRestart')}</span></p>}
    {!status.available && <Hint>{reasons.length ? `${t('deploymentCheckoutUnavailableReason')}${reasonsText}`
      : t('deploymentCheckoutUnavailable')}</Hint>}
    <p>{action}</p>
    {failure && <div className="dt-error" role="alert">
      <p>{t('deploymentCheckoutFailed')}</p>
      {failure.message && <p><span className="dt-mono dt-clamp">{failure.message}</span></p>}
      {failure.log && <p>{t('deploymentCheckoutLog')}{t('labelSeparator')}<span className="dt-mono">{failure.log}</span></p>}
    </div>}
  </>
}

/** Deployment configuration form; falls back to read-only display when DSH config forms are unavailable or read-only. */
export function DeploymentPage({ setup, form, accounts: showAccounts }: { setup: SetupView; form: DeploymentForm; accounts?: boolean }) {
  const { t, notify } = usePanel()
  const snapshot = form?.state
  const editable = snapshot?.status === 'ready' && snapshot.writable
  // Pass `revision` only while DSH serves writable values so a draft started before `ready` rebases once writable.
  const draft = useDraft({ saved: limitsOf(editable ? snapshot.value : setup.machine), revision: editable ? snapshot.revision : undefined,
    reload: async () => {},
    save: async (value, revision, base) => {
      const ops: Op[] = MACHINE_LIMITS.filter(key => value[key].trim() !== base[key].trim())
        .map(key => value[key].trim() ? { op: 'set', path: [key], value: Number(value[key]) } : { op: 'unset', path: [key] })
      if (!form || !await form.mutate(ops, revision)) throw new Error(t('deploymentRefused'))
      notify(t('saved'))
      return { revision: revision + 1, restarting: false }
    } })
  const accounts = setup.accounts
  // Remote browsers (`memory` mode) are read-only; `unavailable` indicates `dsh-superagent` is still starting.
  const readOnlyHint = !form ? t('deploymentNoForms') : snapshot?.mode === 'memory' ? t('deploymentReadOnly')
    : snapshot?.status === 'loading' ? t('loading') : snapshot?.status === 'unavailable' ? t('deploymentUnavailable')
    : !editable ? t('deploymentReadOnly') : undefined
  const limit = (key: typeof MACHINE_LIMITS[number], label: string) => <Field label={label}>
    <Input type="number" min={LIMITS[key].min} max={LIMITS[key].max} step={1} value={draft.value[key]} disabled={!editable}
      onChange={event => draft.edit({ ...draft.value, [key]: event.target.value })} />
  </Field>
  const feishu = accounts?.feishu ? accounts.feishu.name || accounts.feishu.botId
    : setup.feishuProblem ? setupText(t, setup.feishuProblem) : t('deploymentFeishuNone')
  return <form className="dt-form" onSubmit={event => { void draft.submit(event) }}>
    <Fields disabled={draft.busy}>
      <Hint>{t('deploymentIntro')}</Hint>
      {setup.problem && <div className="dt-row-buttons">
        <p className="dt-error" role="status"><SetupMessage problem={setup.problem} lead /></p><CheckSetupButton />
      </div>}
      {showAccounts && <Section title={t('deploymentDerived')} hint={t('deploymentDerivedHint')}>
        <KeyValues rows={[[t('deploymentCodeRepository'), accounts?.repository ?? '—'],
          [t('deploymentIntakeRepository'), accounts?.intakeRepository ?? '—'],
          [t('deploymentAgent'), accounts ? `@${accounts.agent}` : '—'], [t('deploymentFeishu'), feishu]]} />
        <Hint>{t('deploymentAccountsWhere')}</Hint>
      </Section>}
      <LocalCheckoutSection setup={setup} t={t} />
      <Section title={t('deploymentMachine')}>
        {readOnlyHint && <Hint>{readOnlyHint}</Hint>}
        <div className="dt-field">
          <span className="dt-field-head">{t('deploymentStateDir')}<InfoTip text={t('deploymentStateDirHint')} /></span>
          <span className="dt-mono">{setup.machine.stateDir}</span>
        </div>
      </Section>
      <Section title={t('deploymentLimits')} hint={t('deploymentLimitsHint')}>
        {limit('promptMaxChars', t('deploymentPromptMaxChars'))}
        {limit('admissionContextMaxPages', t('deploymentContextPages'))}
        {limit('admissionContextTimeoutMs', t('deploymentContextTimeout'))}
      </Section>
    </Fields>
    {editable && <SaveBar {...draft} onDiscard={draft.discard} />}
  </form>
}

/** Plugin Manager config page; includes derived repository and accounts because Source settings live in the main panel. */
function PluginPage({ form }: { form: DeploymentForm }) {
  const { t } = usePanel()
  const { state, error } = usePanelData()
  return <div className="dt-embedded">
    {state ? <DeploymentPage setup={state.setup} form={form} accounts />
      : error ? <p className="dt-error" role="alert">{error.message}</p> : <p className="dt-hint">{t('loading')}</p>}
  </div>
}
/** DSH Plugin Manager config view entry; renders nothing in `summary` mode because DSH displays the package description. */
export function PluginConfig({ t, view, form }: { t: T; view: 'page' | 'summary'; form: DeploymentForm }) {
  return view === 'page' ? <PanelProvider t={t} interval={10_000}><PluginPage form={form} /></PanelProvider> : null
}
