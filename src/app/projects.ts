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
    const config = this.host.store.settings().sources.github?.config
    const parsed = GithubConfigSchema.safeParse(normalizeGithubConfig(config ?? {}))
    return parsed.success ? parsed.data.chains : []
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
    // The project record exists before the chain does so a failed chain save can remove it again, leaving no artifact.
    this.host.local.putProject(project)
    try {
      await this.save(block, enabled, config, [...config.chains, this.row(project)])
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
    const row = this.row({ id: target, intakeRepository: fields.intakeRepository, codeRepository: fields.codeRepository })
    const { block, config, enabled } = this.source()
    const exists = config.chains.some(chain => chain.id === target)
    const chains = exists ? config.chains.map(chain => chain.id === target ? row : chain) : [...config.chains, row]
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
  private row(project: { id: string; intakeRepository?: string; codeRepository?: string }): GithubChain {
    const code = project.codeRepository ?? ''
    return { id: project.id, intakeRepository: project.intakeRepository ?? code, codeRepository: code }
  }

  /** The `worktreeRoot` field to merge: an omitted key keeps the stored root, and an empty value clears it. */
  private worktreeRoot(input: { worktreeRoot?: string }, project?: LocalProject): { worktreeRoot?: string } {
    if ('worktreeRoot' in input) return { worktreeRoot: input.worktreeRoot }
    return project?.worktreeRoot !== undefined ? { worktreeRoot: project.worktreeRoot } : {}
  }
}