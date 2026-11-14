/** Coordinating layer that gives each local project its own GitHub repository chain in the GitHub Source settings. */
import { UserError } from '../core/index.ts'
import { GithubConfigSchema, normalizeGithubConfig, type Deployment, type GithubChain, type GithubConfig } from '../deployment.ts'
import { KV } from '../kv.ts'
import type { LocalProject, LocalProjectView } from '../sources/local-format.ts'
import type { LocalIssues, LocalProjectFields } from './local.ts'
import type { Settings } from './settings.ts'
import type { Store } from './store.ts'

/** Host dependencies used by `Projects`. */
export interface ProjectsHost {
  readonly store: Pick<Store, 'delete' | 'settings'>
  readonly local: LocalIssues
  readonly settings: Pick<Settings, 'block' | 'save'>
  /** Whether setup resolved the GitHub chains, so a project's bot account can be reported. */
  configured?(): boolean
  /** The deployment of one chain, whose account the panel shows beside a project. */
  deploymentFor?(chain?: string): Deployment
}

/** The editable project fields; `cli` is not a project field but the GitHub CLI written to the project's chain row. */
export type ProjectInput = { name: string; intakeRepository: string; codeRepository: string; worktreeRoot?: string; prepare?: string;
  blockedCommands?: string[]; cli?: string }
export type ProjectUpdate = { name?: string; intakeRepository?: string; codeRepository?: string; worktreeRoot?: string; prepare?: string;
  blockedCommands?: string[]; cli?: string }

/** The chains a stored GitHub Source configuration holds, read leniently so a guard never throws on an old shape. */
function configuredChains(config: unknown): GithubChain[] {
  const parsed = GithubConfigSchema.safeParse(normalizeGithubConfig(config))
  return parsed.success ? parsed.data.chains : []
}

/**
 * Owns the project ↔ GitHub chain association: a new project appends one chain whose id is the project id, and an edit
 * updates only that project's chain. Repository access is checked by `Settings.save` before anything is stored, so an
 * unreadable intake repository, an unpushable code repository or an unusable bot CLI fails the request without a
 * partial chain or project. `cli` is that bot: a CLI wrapper signed in as the account the project's chain acts as.
 */
export class Projects {
  constructor(private readonly host: ProjectsHost) {}

  /** The GitHub Source block, its parsed configuration, and whether the Source is enabled. */
  private source(): { block: { revision: number; value: unknown }; config: GithubConfig; enabled: boolean } {
    let block: { block: string; revision: number; value: unknown }
    try { block = this.host.settings.block('source:github') }
    catch (error) {
      if (error instanceof UserError && error.code === 'unknownBlock') throw new UserError('sourceNotInstalled', { source: 'github' })
      throw error
    }
    const value = block.value as { enabled?: boolean; config?: unknown } | undefined
    return { block, config: GithubConfigSchema.parse(normalizeGithubConfig(value?.config ?? {})), enabled: value?.enabled === true }
  }

  /** The stored GitHub chains, read without requiring the Source to be installed, for startup binding and views. */
  private chains(): GithubChain[] {
    return configuredChains(this.host.store.settings().sources.github?.config)
  }

  /**
   * Guard a GitHub Source save before it is written. A chain a project uses may not disappear from the list, because
   * that would silently cut the project off from its intake repository: deleting and renaming (changing its id) are both
   * refused with the project that owns it. Two chains may not receive Issues from the same repository, which would accept
   * every requirement twice; that check also covers a save made outside the project form.
   */
  guardSource(current: unknown, candidate: unknown): void {
    const before = configuredChains(current), after = configuredChains(candidate)
    const saved = new Set(after.map(chain => chain.id))
    for (const project of this.host.local.projects()) {
      if (!project.chain || saved.has(project.chain) || !before.some(chain => chain.id === project.chain)) continue
      throw new UserError('projectChainInUse', { chain: project.chain, project: project.name })
    }
    for (let index = 0; index < after.length; index++) {
      const chain = after[index]!
      const conflict = after.slice(0, index).find(other => this.sameRepository(this.intakeOf(other), this.intakeOf(chain)))
      if (conflict) throw this.intakeTaken(this.intakeOf(chain), conflict)
    }
  }

  /** The repository a chain receives Issues from; a blank intake repository uses its code repository. */
  private intakeOf(chain: GithubChain): string { return chain.intakeRepository || chain.codeRepository }

  /** Whether two repository names denote the same GitHub repository, which is case-insensitive. */
  private sameRepository(left: string, right: string): boolean { return left.toLowerCase() === right.toLowerCase() }

  /** Refuse `repository` when a chain other than `except` already receives Issues from it. */
  private assertIntakeFree(repository: string, chains: readonly GithubChain[], except?: string): void {
    const conflict = chains.find(chain => chain.id !== except && this.sameRepository(this.intakeOf(chain), repository))
    if (conflict) throw this.intakeTaken(repository, conflict)
  }

  /** The refusal for a taken intake repository, naming the project that owns the chain when one does. */
  private intakeTaken(repository: string, chain: GithubChain): UserError {
    const owner = this.host.local.projects().find(project => project.chain === chain.id)
    return owner ? new UserError('projectIntakeTaken', { repository, project: owner.name })
      : new UserError('chainIntakeTaken', { repository, chain: chain.id })
  }

  /** Save the GitHub Source block with `chains`, reusing the loaded revision so a concurrent edit is a conflict. */
  private save(block: { revision: number }, enabled: boolean, config: GithubConfig, chains: GithubChain[]): Promise<unknown> {
    return this.host.settings.save('source:github', { enabled, config: { ...config, chains } }, block.revision, 'panel')
  }

  /** Every project with its chain's CLI and resolved bot account, newest first. */
  list(): LocalProjectView[] { return this.host.local.projects().map(project => this.view(project)) }

  /**
   * One project as the panel reads it. The chain's CLI and the account it resolves to are derived on every read, so
   * the project record never carries a bot of its own and a setup that resolves a different account shows through.
   */
  view(project: LocalProject): LocalProjectView {
    const chain = this.chainOf(project)
    const row = this.chains().find(item => item.id === chain)
    const login = this.account(chain)
    return { ...project, cli: row?.cli ?? '', ...(login ? { bot: login } : {}) }
  }

  /** The chain a project executes through: its own chain, or `default` for a legacy record without one. */
  private chainOf(project: LocalProject): string { return project.chain ?? 'default' }

  /** The account a chain's CLI is signed in to, once setup has resolved it; absent while setup is incomplete. */
  private account(chain: string): string | undefined {
    if (!this.host.configured?.()) return undefined
    let deployment: Deployment | undefined
    try { deployment = this.host.deploymentFor?.(chain) } catch { return undefined /* Setup resolved no deployment. */ }
    // A chain added since the last setup is not resolved yet: report no account rather than another chain's account.
    if (chain !== 'default' && deployment?.chains && !deployment.chains[chain]) return undefined
    return deployment?.github.login
  }

  /** Create a project that owns the GitHub chain named by its own id, whose bot is the entered CLI when one is given. */
  async create(input: ProjectInput): Promise<LocalProject> {
    const fields = this.host.local.validateProject(input)
    const project = this.host.local.draftProject(fields)
    const { block, config, enabled } = this.source()
    const row = this.row(project, input.cli)
    // Refuse a second chain for an occupied intake repository before writing anything; the record below stays removable.
    this.assertIntakeFree(this.intakeOf(row), config.chains)
    // The project record exists before the chain does so a failed chain save can remove it again, leaving no artifact.
    this.host.local.putProject(project)
    try {
      await this.save(block, enabled, config, [...config.chains, row])
    } catch (error) {
      this.host.store.delete(KV.local.project(project.id))
      throw error
    }
    return project
  }

  /** Update a project and, when it owns a chain, only that project's chain row; an omitted `cli` keeps the chain's bot. */
  async update(id: string, input: ProjectUpdate): Promise<LocalProject> {
    const { local } = this.host
    const project = local.project(id)
    if (!project) throw new UserError('unknownProject')
    const namedRepositories = input.intakeRepository !== undefined || input.codeRepository !== undefined
    const ownsChain = project.chain !== undefined || project.codeRepository !== undefined || namedRepositories
    if (!ownsChain) {
      // A legacy project with only `repository`: editing its name or root keeps its record and execution fallback as-is.
      const root = 'worktreeRoot' in input ? input.worktreeRoot : project.worktreeRoot
      const fields = local.validateProject({ name: input.name ?? project.name,
        ...(project.repository !== undefined ? { repository: project.repository } : {}),
        ...(root !== undefined ? { worktreeRoot: root } : {}),
        ...this.prepare(input, project), ...this.blockedCommands(input, project) }, project)
      const updated = local.patchProject(project, fields)
      local.putProject(updated)
      return updated
    }
    const merged: LocalProjectFields = {
      name: input.name ?? project.name,
      ...(project.repository !== undefined ? { repository: project.repository } : {}),
      codeRepository: input.codeRepository ?? project.codeRepository ?? project.repository,
      intakeRepository: input.intakeRepository ?? project.intakeRepository ?? project.codeRepository ?? project.repository,
      ...this.worktreeRoot(input, project),
      ...this.prepare(input, project),
      ...this.blockedCommands(input, project),
    }
    const fields = local.validateProject(merged, project)
    const target = project.chain ?? project.id
    const { block, config, enabled } = this.source()
    const existing = config.chains.find(chain => chain.id === target)
    // Only this chain's row changes. An entered CLI, including an emptied one, replaces the row's bot; leaving the key
    // out keeps whatever the row holds, so editing the repositories never resets a project's bot.
    const cli = 'cli' in input ? input.cli : existing?.cli
    const row = this.row({ id: target, intakeRepository: fields.intakeRepository, codeRepository: fields.codeRepository }, cli)
    // Only this project's row changes; an occupied intake repository named by another chain is refused before the save.
    this.assertIntakeFree(this.intakeOf(row), config.chains, target)
    const chains = existing ? config.chains.map(chain => chain.id === target ? row : chain) : [...config.chains, row]
    await this.save(block, enabled, config, chains)
    const updated = local.patchProject(project, { ...fields, chain: target })
    try { local.putProject(updated) }
    catch (error) {
      // Best effort: put the chain configuration back so a failed record write leaves no chain behind.
      const revision = this.host.settings.block('source:github').revision
      await this.host.settings.save('source:github', { enabled, config: { ...config, chains: config.chains } }, revision, 'panel').catch(() => {})
      throw error
    }
    return updated
  }

  /**
   * Bind legacy projects that only carry an execution repository to an existing chain whose code repository matches it.
   * Startup calls this once; it only writes project records, so repeating it leaves already-bound projects untouched.
   */
  bindLegacy(): void {
    const chains = this.chains()
    for (const project of this.host.local.projects()) {
      if (project.chain || project.codeRepository || !project.repository) continue
      const chain = chains.find(item => item.codeRepository === project.repository)
      if (!chain) continue
      this.host.local.putProject({ ...project, chain: chain.id, intakeRepository: chain.intakeRepository,
        codeRepository: chain.codeRepository, updatedAt: new Date().toISOString() })
    }
  }

  /** A chain row for a project, defaulting the intake repository to the code repository when a legacy record has one. */
  private row(project: { id: string; intakeRepository?: string; codeRepository?: string }, cli = ''): GithubChain {
    const code = project.codeRepository ?? ''
    return { id: project.id, intakeRepository: project.intakeRepository ?? code, codeRepository: code, cli: cli?.trim() ?? '' }
  }

  /** The `worktreeRoot` field to merge: an omitted key keeps the stored root, and an empty value clears it. */
  private worktreeRoot(input: { worktreeRoot?: string }, project?: LocalProject): { worktreeRoot?: string } {
    if ('worktreeRoot' in input) return { worktreeRoot: input.worktreeRoot }
    return project?.worktreeRoot !== undefined ? { worktreeRoot: project.worktreeRoot } : {}
  }

  /** The `prepare` field to merge: an omitted key keeps the stored command, and an empty value clears it. */
  private prepare(input: { prepare?: string }, project?: LocalProject): { prepare?: string } {
    if ('prepare' in input) return { prepare: input.prepare }
    return project?.prepare !== undefined ? { prepare: project.prepare } : {}
  }

  /** The `blockedCommands` field to merge: an omitted key keeps the stored list, and an empty list clears it. */
  private blockedCommands(input: { blockedCommands?: string[] }, project?: LocalProject): { blockedCommands?: string[] } {
    if ('blockedCommands' in input) return { blockedCommands: input.blockedCommands }
    return project?.blockedCommands?.length ? { blockedCommands: project.blockedCommands } : {}
  }
}
