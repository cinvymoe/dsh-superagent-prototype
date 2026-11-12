/** The running checkout's local merge: chain matching through every remote, the reason codes, the one run, its log, and the single flight. */
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { UserError } from '../src/core/index.ts'
import { Checkout } from '../src/app/checkout.ts'
import { Prepare, type PrepareChain, type PrepareOptions, type PrepareRun } from '../src/app/prepare.ts'
import { gitEnv } from './fixtures/git.ts'

// Each case starts real git processes on its own temporary repository, which the suite's default timeout is too short for.
vi.setConfig({ testTimeout: 30_000 })
const exec = promisify(execFile)
const IDENTITY = { GIT_AUTHOR_NAME: 'Prepare Test', GIT_AUTHOR_EMAIL: 'prepare@example.com',
  GIT_COMMITTER_NAME: 'Prepare Test', GIT_COMMITTER_EMAIL: 'prepare@example.com' }
let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'dsh-superagent-prepare-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })
/** Runs git in a test's own environment: no inherited repository, and the explicit identity commits need. */
const git = async (cwd: string, ...args: string[]): Promise<string> =>
  (await exec('git', args, { cwd, env: gitEnv(IDENTITY) })).stdout.trim()
/** A checkout on `main` with one commit and the given remotes, or without a commit when `commit` is false. */
async function repository(name: string, remotes: Record<string, string> = {}, commit = true): Promise<string> {
  const root = join(dir, name)
  mkdirSync(root)
  await git(root, 'init', '-q', '-b', 'main')
  for (const [remote, url] of Object.entries(remotes)) await git(root, 'remote', 'add', remote, url)
  if (commit) {
    writeFileSync(join(root, 'readme.md'), 'first\n')
    await git(root, 'add', 'readme.md')
    await git(root, 'commit', '-q', '-m', 'first')
  }
  return root
}
const toplevel = (root: string): Promise<string> => git(root, 'rev-parse', '--show-toplevel')
const chain = (repository: string, id = 'default'): PrepareChain[] => [{ id, repository }]
/** A `Prepare` whose script is never spawned: each case supplies its own runner or a script path it controls. */
const prepareOf = (root: string, options: Partial<PrepareOptions> = {}): Prepare => new Prepare({ checkout: new Checkout(root),
  directory: root, script: join(dir, 'dsh-superagent'), logDir: join(dir, 'logs'), chains: () => chain('acme/widgets'), ...options })
/** Each work tree file's content hash, without the `.git` directory a read may refresh. */
function contents(directory: string, base = directory): Record<string, string> {
  const hashes: Record<string, string> = {}
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === '.git') continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) Object.assign(hashes, contents(path, base))
    else hashes[relative(base, path)] = createHash('sha256').update(readFileSync(path)).digest('hex')
  }
  return hashes
}
/** The `UserError` a merge answered, so its code and values can be read. */
const failureOf = async (run: Promise<unknown>): Promise<UserError> => {
  const error = await run.then(() => undefined, (failure: unknown) => failure)
  expect(error).toBeInstanceOf(UserError)
  return error as UserError
}

describe('Prepare.status', () => {
  it('matches a chain whose code repository a remote other than origin names, and reads the checkout facts', async () => {
    const root = await repository('matched', { origin: 'git@github.com:deepseek-ai/dsh-superagent-prototype.git',
      deployment: 'https://github.com/acme/widgets.git' })
    const status = await prepareOf(root).status()
    expect(status).toMatchObject({ chain: 'default', repository: 'acme/widgets', available: true, reasons: [], running: false })
    expect(status.checkout).toMatchObject({ path: await toplevel(root), branch: 'main', dirty: false,
      head: await git(root, 'rev-parse', 'HEAD'), committedAt: await git(root, 'log', '-1', '--format=%cI') })
    expect(status.checkout.remotes).toEqual([{ name: 'deployment', repository: 'acme/widgets' },
      { name: 'origin', repository: 'deepseek-ai/dsh-superagent-prototype' }])
  })
  it('reports noChain when no configured chain names a remote of the checkout', async () => {
    const root = await repository('unmatched', { origin: 'https://github.com/acme/widgets.git' })
    const status = await prepareOf(root, { chains: () => chain('acme/other') }).status()
    expect(status).toMatchObject({ chain: null, repository: null, available: false, reasons: ['noChain'] })
  })
  it('reports empty for a checkout whose main has no commit yet', async () => {
    const root = await repository('unborn', { origin: 'https://github.com/acme/widgets.git' }, false)
    const status = await prepareOf(root).status()
    expect(status).toMatchObject({ chain: 'default', repository: 'acme/widgets', available: false, reasons: ['empty'] })
    expect(status.checkout.head).toBeNull()
  })
  it('keeps the checkout\'s own reasons, before noChain, and still names the branch and dirty tree it read', async () => {
    const branch = await repository('branch', { origin: 'https://github.com/acme/widgets.git' })
    await git(branch, 'checkout', '-q', '-b', 'feature')
    expect(await prepareOf(branch).status()).toMatchObject({ chain: 'default', available: false, reasons: ['notMain'] })
    const dirty = await repository('dirty', { origin: 'https://github.com/acme/widgets.git' })
    writeFileSync(join(dirty, 'readme.md'), 'changed\n')
    expect(await prepareOf(dirty).status()).toMatchObject({ available: false, reasons: ['dirty'] })
    expect(await prepareOf(dirty, { chains: () => chain('acme/other') }).status()).toMatchObject({ chain: null,
      reasons: ['dirty', 'noChain'] })
  })
  it('leaves the work tree, its refs and its commit as a read found them', async () => {
    const root = await repository('readonly', { origin: 'https://github.com/acme/widgets.git' })
    const before = { head: await git(root, 'rev-parse', 'HEAD'), status: await git(root, 'status', '--porcelain'),
      refs: await git(root, 'for-each-ref'), files: contents(root) }
    await prepareOf(root).status()
    expect({ head: await git(root, 'rev-parse', 'HEAD'), status: await git(root, 'status', '--porcelain'),
      refs: await git(root, 'for-each-ref'), files: contents(root) }).toEqual(before)
  })
})

describe('Prepare.merge', () => {
  it('runs the script with the matched repository in the checkout, logs its output, and answers the moved commit', async () => {
    const root = await repository('merge', { origin: 'git@github.com:deepseek-ai/dsh-superagent-prototype.git',
      deployment: 'https://github.com/Acme/Widgets.git' })
    const script = join(dir, 'dsh-superagent')
    const before = await git(root, 'rev-parse', 'HEAD')
    const runs: { file: string; args: string[]; cwd: string; env: Record<string, string | undefined> }[] = []
    const run: PrepareRun = async (file, args, options) => {
      runs.push({ file, args, cwd: options.cwd, env: options.env })
      options.sink('$ git fetch --no-tags deployment\n')
      await exec('git', ['commit', '-q', '--allow-empty', '-m', 'merged'], { cwd: options.cwd, env: gitEnv(IDENTITY) })
      options.sink('prepare: fast-forwarded by one commit on main\n')
      return 0
    }
    const logDir = join(dir, 'logs')
    const prepare = prepareOf(root, { script, logDir, run })
    // A host started inside git passes its repository on; the script must find the checkout from its directory instead.
    const result = await (async () => {
      process.env.GIT_DIR = join(dir, 'elsewhere')
      try { return await prepare.merge() } finally { delete process.env.GIT_DIR }
    })()
    const after = await git(root, 'rev-parse', 'HEAD')
    expect(result).toMatchObject({ merged: true, head: after })
    expect(result.log.startsWith(join(logDir, 'prepare-'))).toBe(true)
    expect(result.log.endsWith('.log')).toBe(true)
    expect(after).not.toBe(before)
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({ file: script, args: ['prepare', '--repository', 'acme/widgets'], cwd: await toplevel(root) })
    expect(runs[0]!.env.GIT_DIR).toBeUndefined()
    expect(runs[0]!.env.GIT_TERMINAL_PROMPT).toBe('0')
    expect(runs[0]!.env.GIT_ASKPASS).toBe('')
    expect(statSync(result.log).mode & 0o777).toBe(0o600)
    expect(statSync(logDir).mode & 0o777).toBe(0o700)
    expect(readFileSync(result.log, 'utf8')).toContain('prepare: fast-forwarded by one commit on main')
  })
  it('answers that nothing was merged when the script leaves the commit where it was', async () => {
    const root = await repository('current', { origin: 'https://github.com/acme/widgets.git' })
    const run: PrepareRun = async (_file, _args, options) => { options.sink('prepare: up to date at 0123456 on main\n'); return 0 }
    const head = await git(root, 'rev-parse', 'HEAD')
    const result = await prepareOf(root, { run }).merge()
    expect(result).toMatchObject({ merged: false, head })
    expect(result.log.endsWith('.log')).toBe(true)
  })
  it('answers the script\'s output tail and its log when the script refuses', async () => {
    const root = await repository('refused', { origin: 'https://github.com/acme/widgets.git' })
    const lines = Array.from({ length: 300 }, (_, index) => `prepare: line ${index} of a long refusal`)
    const run: PrepareRun = async (_file, _args, options) => {
      options.sink('prepare: this checkout has uncommitted changes; commit or stash them first:\n M readme.md\n')
      options.sink(lines.join('\n'))
      return 1
    }
    const failure = await failureOf(prepareOf(root, { run }).merge())
    expect(failure.code).toBe('prepareFailed')
    // The message is the output's tail, bounded, while the log keeps all of it from the script's first line.
    expect(failure.values.message).toContain('line 299 of a long refusal')
    expect(failure.values.message).not.toContain('line 0 ')
    expect(failure.values.message!.length).toBeLessThanOrEqual(4000)
    const logged = readFileSync(failure.values.log!, 'utf8')
    expect(logged).toContain('prepare: this checkout has uncommitted changes')
    expect(logged).toContain('prepare: line 0 of a long refusal')
  })
  it('answers a script that cannot start with the same failure and a log that exists', async () => {
    const root = await repository('missing', { origin: 'https://github.com/acme/widgets.git' })
    const prepare = prepareOf(root, { script: join(dir, 'missing-script') })
    const failure = await failureOf(prepare.merge())
    expect(failure.code).toBe('prepareFailed')
    expect(failure.values.message).toContain('ENOENT')
    expect(readFileSync(failure.values.log!, 'utf8')).toContain('ENOENT')
  })
  it('runs the real script through its shebang when no runner is given, passing the repository and logging both streams', async () => {
    const root = await repository('spawned', { origin: 'https://github.com/acme/widgets.git' })
    const logDir = join(dir, 'logs')
    const refusing = join(dir, 'refusing-prepare')
    writeFileSync(refusing, '#!/bin/sh\necho "prepare: refusing in $PWD"\necho "prepare: rejected by the script" >&2\nexit 1\n', { mode: 0o755 })
    const failure = await failureOf(prepareOf(root, { script: refusing, logDir }).merge())
    expect(failure.code).toBe('prepareFailed')
    expect(failure.values.message).toContain('rejected by the script')
    const logged = readFileSync(failure.values.log!, 'utf8')
    expect(logged).toContain('refusing in')
    expect(logged).toContain('rejected by the script')
    // The script's own environment reaches it: the run prints the arguments and the checkout it ran in.
    const current = join(dir, 'current-prepare')
    writeFileSync(current, '#!/bin/sh\necho "prepare: up to date at 0123456 on main ($*, $PWD)"\n', { mode: 0o755 })
    const result = await prepareOf(root, { script: current, logDir }).merge()
    expect(result.merged).toBe(false)
    expect(readFileSync(result.log, 'utf8')).toContain(`--repository acme/widgets, ${await toplevel(root)}`)
  })
  it('runs the real service script with its prepare action, fast-forwarding a mirror and building once', async () => {
    const root = join(dir, 'scripted')
    mkdirSync(join(root, 'scripts'), { recursive: true })
    mkdirSync(join(root, 'bin'))
    writeFileSync(join(root, '.gitignore'), ['bin/', 'remotes/', 'pnpm.log', '.artifacts/'].join('\n') + '\n')
    // The script reads its own checkout from its path, so the copy is the checkout it merges into.
    const script = join(root, 'scripts', 'dsh-superagent')
    copyFileSync(join(import.meta.dirname, '..', 'scripts', 'dsh-superagent'), script)
    chmodSync(script, 0o755)
    await git(root, 'init', '-q', '-b', 'main')
    writeFileSync(join(root, 'readme.md'), 'first\n')
    await git(root, 'add', '-A')
    await git(root, 'commit', '-q', '-m', 'the checkout')
    // A mirror named like the chain's repository, one commit ahead of the checkout, and a GitHub URL that names it too.
    const mirror = join(root, 'remotes', 'acme', 'widgets.git')
    mkdirSync(join(root, 'remotes', 'acme'), { recursive: true })
    await git(root, 'init', '-q', '--bare', mirror)
    await git(root, 'remote', 'add', 'origin', 'https://github.com/upstream/prototype.git')
    await git(root, 'remote', 'add', 'deployment', mirror)
    await git(root, 'remote', 'add', 'zz-github', 'https://github.com/acme/widgets.git')
    await git(root, 'push', '-q', 'deployment', 'main:main')
    await git(root, 'commit', '-q', '--allow-empty', '-m', 'the mirror is ahead')
    await git(root, 'push', '-q', 'deployment', 'HEAD:main')
    await git(root, 'reset', '-q', '--hard', 'HEAD~1')
    // The build runs the pnpm on PATH; the stub records its commands and succeeds.
    const pnpm = join(root, 'bin', 'pnpm')
    writeFileSync(pnpm, '#!/bin/sh\nprintf \'%s\\n\' "$*" >> "$PWD/pnpm.log"\n', { mode: 0o755 })
    const path = process.env.PATH
    process.env.PATH = `${join(root, 'bin')}:${path}`
    try {
      const result = await prepareOf(root, { script }).merge()
      const mirrorHead = (await exec('git', ['--git-dir', mirror, 'rev-parse', 'main'])).stdout.trim()
      expect(result.merged).toBe(true)
      expect(result.head).toBe(mirrorHead)
      expect(readFileSync(result.log, 'utf8')).toContain('prepare: fast-forwarded from')
      expect(readFileSync(join(root, 'pnpm.log'), 'utf8').trim().split('\n')).toEqual(['install --frozen-lockfile', 'build'])
    } finally { process.env.PATH = path }
  })
  it('refuses a second merge while one runs, and runs the script once', async () => {
    const root = await repository('single', { origin: 'https://github.com/acme/widgets.git' })
    let release: (code: number) => void = () => {}
    let calls = 0
    const run: PrepareRun = async () => { calls++; return await new Promise<number>(resolve => { release = resolve }) }
    const prepare = prepareOf(root, { run })
    const first = prepare.merge()
    await vi.waitFor(() => expect(calls).toBe(1), { timeout: 10_000 })
    expect((await prepare.status()).running).toBe(true)
    expect((await failureOf(prepare.merge())).code).toBe('prepareBusy')
    release(0)
    await expect(first).resolves.toMatchObject({ merged: false })
    expect(calls).toBe(1)
    expect((await prepare.status()).running).toBe(false)
  })
  it('lets a later merge run after a failed one, and never signals or exits the process', async () => {
    const root = await repository('retry', { origin: 'https://github.com/acme/widgets.git' })
    const kill = vi.spyOn(process, 'kill')
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    onTestFinished(() => { kill.mockRestore(); exit.mockRestore() })
    let attempt = 0
    const run: PrepareRun = async (_file, _args, options) => {
      attempt++
      if (attempt === 1) { options.sink('prepare: another control operation is in progress\n'); return 1 }
      await exec('git', ['commit', '-q', '--allow-empty', '-m', 'second'], { cwd: options.cwd, env: gitEnv(IDENTITY) })
      return 0
    }
    const prepare = prepareOf(root, { run })
    expect((await failureOf(prepare.merge())).code).toBe('prepareFailed')
    await expect(prepare.merge()).resolves.toMatchObject({ merged: true })
    expect(attempt).toBe(2)
    expect(kill).not.toHaveBeenCalled()
    expect(exit).not.toHaveBeenCalled()
  })
  it('refuses a checkout that cannot take a merge without running the script', async () => {
    const dirty = await repository('dirty-unavailable', { origin: 'https://github.com/acme/widgets.git' })
    writeFileSync(join(dirty, 'readme.md'), 'changed\n')
    let calls = 0
    const run: PrepareRun = async () => { calls++; return 0 }
    const failure = await failureOf(prepareOf(dirty, { run }).merge())
    expect(failure.code).toBe('prepareUnavailable')
    expect(failure.values.reasons).toBe('dirty')
    expect(calls).toBe(0)
  })
})
