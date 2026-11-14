/** Coordinating layer that gives each local project its own GitHub repository chain in the GitHub Source settings. */
import { UserError } from '../core/index.ts'
import { GithubConfigSchema, normalizeGithubConfig, type GithubChain, type GithubConfig } from '../deployment.ts'
import { KV } from '../kv.ts'
import type { LocalProject } from '../sources/local-format.ts'
import type { LocalIssues, LocalProjectFields } from './local.ts'
import type { Settings } from './settings.ts'
import type { Store } from './store.ts'

/** Host dependencies used by `Projects`. */
export interface ProjectsHost {
  readonly store: Pick<Store, 'delete' | 'settings'>
  readonly local: LocalIssues
  readonly settings: Pick<Settings, 'block' | 'save'>
}

/** The chains a stored GitHub Source configuration holds, read leniently so a guard never throws on an old shape. */
function configuredChains(config: unknown): GithubChain[] {
  const parsed = GithubConfigSchema.safeParse(normalizeGithubConfig(config))
  return parsed.success ? parsed.data.chains : []
}

/**
 * Owns the project ↔ GitHub chain association: a new project appends one chain whose id is the project id, and an edit
 * updates only that project's chain. Repository access is checked by `Settings.save` before anything is stored, so an
 * unreadable intake repository or an unpushable code repository fails the request without a partial chain or project.
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

  /** The stored GitHub chains, read without requiring the Source to be installed, for startup binding. */
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

  /** Create a project that owns the GitHub chain named by its own id. */
  async create(input: { name: string; intakeRepository: string; codeRepository: string; worktreeRoot?: string }): Promise<LocalProject> {
    const fields = this.host.local.validateProject(input)
    const project = this.host.local.draftProject(fields)
    const { block, config, enabled } = this.source()
    const row = this.row(project)
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

  /** Update a project and, when it owns a chain, only that project's chain row. */
  async update(id: string, input: { name?: string; intakeRepository?: string; codeRepository?: string; worktreeRoot?: string }): Promise<LocalProject> {
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
        ...(root !== undefined ? { worktreeRoot: root } : {}) }, project)
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
    }
    const fields = local.validateProject(merged, project)
    const target = project.chain ?? project.id
    const { block, config, enabled } = this.source()
    const existing = config.chains.find(chain => chain.id === target)
    const row = this.row({ id: target, intakeRepository: fields.intakeRepository, codeRepository: fields.codeRepository }, existing?.cli)
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
    return { id: project.id, intakeRepository: project.intakeRepository ?? code, codeRepository: code, cli }
  }

  /** The `worktreeRoot` field to merge: an omitted key keeps the stored root, and an empty value clears it. */
  private worktreeRoot(input: { worktreeRoot?: string }, project?: LocalProject): { worktreeRoot?: string } {
    if ('worktreeRoot' in input) return { worktreeRoot: input.worktreeRoot }
    return project?.worktreeRoot !== undefined ? { worktreeRoot: project.worktreeRoot } : {}
  }
}