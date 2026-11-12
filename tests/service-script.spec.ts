/** Tests for scripts/dsh-superagent using a temporary checkout with spaces and stubbed ps, tmux, dsh, pnpm and git fixtures. */
import { execFile, execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, utimesSync, writeFileSync }
  from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'

let root: string
let server: Server | undefined
let sleepers: ChildProcess[] = []
const control = (profile: string) => join(root, '.artifacts', 'control', 'profiles', profile)
const program = (name: string, body: string) => writeFileSync(join(root, 'bin', name), `#!/bin/sh\n${body}\n`, { mode: 0o755 })
/** Run git in the temporary root with an explicit identity, because the global git configuration names none. */
function git(...args: string[]): string {
  return execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', ...args],
    { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim()
}
/** Turn the temporary root into a checkout of acme/widgets on main whose bare remote is one commit ahead. */
function checkout(): { first: string; second: string } {
  writeFileSync(join(root, '.gitignore'), ['bin/', 'remotes/', 'ps.txt', 'ps-started.txt', 'tmux.log', 'pane*', 'launched',
    'held', 'pnpm.log', 'launches', 'current-pid', 'state/', 'rollback.ps', '.artifacts/'].join('\n') + '\n')
  git('init', '-b', 'main')
  git('add', '-A')
  git('commit', '-m', 'the checkout')
  const first = git('rev-parse', 'HEAD')
  mkdirSync(join(root, 'remotes', 'acme'), { recursive: true })
  git('init', '--bare', join(root, 'remotes', 'acme', 'widgets.git'))
  git('remote', 'add', 'origin', join(root, 'remotes', 'acme', 'widgets.git'))
  git('push', '-u', 'origin', 'main')
  writeFileSync(join(root, 'build.txt'), 'the next commit\n')
  git('add', 'build.txt')
  git('commit', '-m', 'the next commit')
  const second = git('rev-parse', 'HEAD')
  git('push', 'origin', 'main')
  git('reset', '--hard', first)
  return { first, second }
}
/** The arguments of every pnpm command the stub ran. */
const builds = (): string[] => existsSync(join(root, 'pnpm.log'))
  ? readFileSync(join(root, 'pnpm.log'), 'utf8').split('\n').filter(Boolean) : []
/** Spawn a dummy process whose PID can be listed by the fake ps binary; ignoreInterrupt simulates a hung graceful stop. */
function sleeper(ignoreInterrupt = false): number {
  const [program, args] = ignoreInterrupt ? ['sh', ['-c', 'trap "" INT; exec sleep 60']] as const : ['sleep', ['60']] as const
  const child = spawn(program, [...args], { stdio: 'ignore' })
  sleepers.push(child)
  return child.pid!
}
const service = (pid: number, profile = 'superagent') => `${pid} node node /opt/my tools/dsh --profile ${profile} --no-open`
/** Write active process lines (`pid ucomm args`) for the fake ps binary. Entries prefixed with `after:<pid> ` appear only after that PID exits. */
const processes = (...lines: string[]) => writeFileSync(join(root, 'ps.txt'), lines.map(line => `${line}\n`).join(''))
const started = (...lines: string[]) => writeFileSync(join(root, 'ps-started.txt'), lines.map(line => `${line}\n`).join(''))
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'service script '))
  mkdirSync(join(root, 'scripts')); mkdirSync(join(root, 'bin'))
  copyFileSync(join(import.meta.dirname, '..', 'scripts', 'dsh-superagent'), join(root, 'scripts', 'dsh-superagent'))
  processes()
  program('ps', `list='${root}/ps.txt'; [ -f '${root}/launched' ] && [ -f '${root}/ps-started.txt' ] && list='${root}/ps-started.txt'
want=; while [ $# -gt 0 ]; do [ "$1" = -p ] && want=$2; shift; done
while IFS= read -r line; do
  case "$line" in after:*) dep=\${line#after:}; dep=\${dep%% *}; kill -0 "$dep" 2>/dev/null && continue; line=\${line#after:$dep };; esac
  pid=\${line%% *}; kill -0 "$pid" 2>/dev/null || continue
  if [ -z "$want" ] || [ "$pid" = "$want" ]; then printf '%s\\n' "$line"; fi
done < "$list"`)
  // Log tmux invocations and simulate session creation by outputting the pane PID.
  program('tmux', `for a in "$@"; do printf '%s\\n' "$a"; done >> '${root}/tmux.log'; echo --- >> '${root}/tmux.log'\n`
    + `case "$1" in has-session) exit 1;; new-*) touch '${root}/launched'; cat '${root}/pane';; esac`)
  program('dsh', 'exit 0')
  program('pnpm', `for a in "$@"; do printf '%s\\n' "$a"; done >> '${root}/pnpm.log'`)
})
afterEach(() => {
  server?.close(); server = undefined
  for (const child of sleepers) child.kill()
  sleepers = []
  rmSync(root, { recursive: true, force: true })
})
function run(...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise(resolve => execFile('python3', [join(root, 'scripts', 'dsh-superagent'), ...args],
    { env: { ...process.env, PATH: `${join(root, 'bin')}:${process.env.PATH}`, DSH_SUPERAGENT_PROFILE: '', DSH_SUPERAGENT_URL: '' },
      timeout: 20_000 },
    (error, stdout, stderr) => resolve({ code: typeof error?.code === 'number' ? error.code : 0, stdout, stderr })))
}
const READY = { health: { runtime: { state: 'ready', detail: '' } }, setup: { problem: null, feishuProblem: null } }
/** Start a mock HTTP server that returns 503 until tmux launches the service (unless always is true). */
async function answering(state: unknown = READY, always = false): Promise<string> {
  server = createServer((_request, response) => {
    if (!always && !existsSync(join(root, 'launched'))) { response.writeHead(503).end(); return }
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(state))
  })
  await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server!.address() as AddressInfo).port}`
}
/** Start a mock management API that answers `GET state` only while the PID recorded in current-pid is alive, as a stopped service answers nothing. */
async function serving(state: unknown): Promise<string> {
  server = createServer((_request, response) => {
    let alive = false
    try {
      const pid = Number(readFileSync(join(root, 'current-pid'), 'utf8').trim())
      if (Number.isInteger(pid) && pid > 0) { process.kill(pid, 0); alive = true }
    } catch {}
    if (!alive) { response.writeHead(503).end(); return }
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(state))
  })
  await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server!.address() as AddressInfo).port}`
}
/** The `GET state` answer activate reads: the database directory and the Executor load. */
const readyState = (running = 0) => ({ health: { runtime: { state: 'ready', detail: '' } },
  setup: { problem: null, feishuProblem: null, machine: { stateDir: join(root, 'state') } }, load: { running, queued: 0 } })
/** Write the database activate backs up, with a write-ahead log. */
function database(text = 'the database'): void {
  mkdirSync(join(root, 'state'), { recursive: true })
  writeFileSync(join(root, 'state', 'orchestrator.sqlite'), text)
  writeFileSync(join(root, 'state', 'orchestrator.sqlite-wal'), 'the write-ahead log')
}
/** Install a tmux stub whose launch records the PID in `pane` as the live service; the first launch of rollback mode prints none. */
function launching(skipFirst = false): void {
  program('tmux', `for a in "$@"; do printf '%s\\n' "$a"; done >> '${root}/tmux.log'; echo --- >> '${root}/tmux.log'
case "$1" in
  has-session) exit 1;;
  new-*)
    touch '${root}/launched'
    n=$(cat '${root}/launches' 2>/dev/null); n=\${n:-0}
    n=$((n+1)); printf '%s\\n' "$n" > '${root}/launches'
    ${skipFirst ? '[ "$n" = 1 ] && exit 0\n    ' : ''}pid=$(cat '${root}/pane')
    printf '%s\\n' "$pid" > '${root}/current-pid'
    printf '%s node node /opt/dsh --profile superagent --no-open\\n' "$pid" >> '${root}/ps-started.txt'
    printf '%s\\n' "$pid";;
esac`)
}
const status = async (profile: string, url = 'http://127.0.0.1:9') =>
  JSON.parse((await run('status', '--profile', profile, '--url', url)).stdout) as { pids: number[]; manually_stopped: boolean }

it('refuses to stop when two processes serve the profile, before it writes the stop marker', async () => {
  processes(service(sleeper()), `${sleeper()} node node /opt/dsh --profile=superagent`)
  expect(await run('stop')).toMatchObject({ code: 1, stderr: expect.stringContaining('Multiple dsh-superagent processes found') })
  expect(existsSync(join(control('superagent'), 'manually-stopped'))).toBe(false)
})
it('keeps a stop per profile', async () => {
  expect(await run('stop', '--profile', 'one')).toMatchObject({ code: 0, stdout: expect.stringContaining('Automatic recovery is paused') })
  expect(await status('one')).toMatchObject({ manually_stopped: true })
  expect(await status('two')).toMatchObject({ manually_stopped: false })
  const skipped = await run('--respect-stop', 'start', '--profile', 'one')
  expect(skipped).toMatchObject({ code: 0, stdout: expect.stringContaining('Intentional stop is active') })
})
it('takes no `dsh plugin` command of the profile for its service', async () => {
  const service = sleeper()
  processes(`${sleeper()} node node /opt/my tools/dsh plugin --profile superagent add link:/x`,
    `${service} node node /opt/my tools/dsh --profile superagent --no-open`)
  expect(await status('superagent')).toMatchObject({ pids: [service] })
})
it('records the service PID at start, and still refuses a second instance the scan finds', async () => {
  const url = await answering()
  const pid = sleeper()
  writeFileSync(join(root, 'pane'), `${pid}\n`)
  started(service(pid))
  const start = await run('start', '--url', url, '--timeout', '10')
  expect(start).toMatchObject({ code: 0, stdout: expect.stringContaining(`"pids": [\n    ${pid}\n  ]`) })
  expect(readFileSync(join(control('superagent'), 'service.pid'), 'utf8')).toBe(`${pid}\n`)
  const tmux = readFileSync(join(root, 'tmux.log'), 'utf8').split('---\n').find(call => call.startsWith('new-session'))!.split('\n')
  // The checkout's path, which has a space, is one argument, and the log path inside it is quoted for the shell.
  const checkout = realpathSync(root)
  expect(tmux).toEqual(expect.arrayContaining(['-P', '-F', '#{pane_pid}', '-c', checkout]))
  const log = new RegExp(`>> '${checkout}/\\.artifacts/dsh-superagent-superagent-\\d{8}-\\d{6}-\\d+\\.log' 2>&1$`)
  expect(tmux.find(word => word.startsWith('umask 077; exec '))).toMatch(log)
  const second = sleeper()
  started(service(pid), `${second} node node /opt/dsh --profile superagent`)
  const again = await run('start', '--url', url, '--timeout', '10')
  expect(again).toMatchObject({ code: 1, stderr: expect.stringContaining('Multiple dsh-superagent processes') })
  expect(await status('superagent')).toMatchObject({ pids: [pid, second] })
}, 20_000)
it('waits only for the process it stopped', async () => {
  const pid = sleeper()
  // Another instance shows up once the stopped one ended.
  processes(service(pid), `after:${pid} ${sleeper()} node node /opt/dsh --profile superagent`)
  expect(await run('stop', '--stop-timeout', '5')).toMatchObject({ code: 0, stdout: expect.stringContaining('dsh-superagent stopped') })
}, 20_000)
it('keeps only the newest logs it wrote for the profile', async () => {
  const url = await answering()
  const pid = sleeper()
  writeFileSync(join(root, 'pane'), `${pid}\n`)
  started(service(pid))
  mkdirSync(join(root, '.artifacts'), { recursive: true })
  for (const profile of ['superagent', 'other']) for (let index = 0; index < 25; index++) {
    const log = join(root, '.artifacts', `dsh-superagent-${profile}-20260901-0000${String(index).padStart(2, '0')}-1.log`)
    writeFileSync(log, '')
    utimesSync(log, 1_700_000_000 + index, 1_700_000_000 + index)
  }
  writeFileSync(join(root, '.artifacts', 'dsh-superagent-20260901-000000-1.log'), '')
  expect(await run('start', '--url', url, '--timeout', '10')).toMatchObject({ code: 0 })
  const logs = readdirSync(join(root, '.artifacts'))
  const own = logs.filter(name => name.startsWith('dsh-superagent-superagent-')).sort()
  expect(own).toHaveLength(20)
  // The oldest went; the new one stays, with the newest earlier ones. Another profile's logs and older names stay.
  expect(own).not.toContain('dsh-superagent-superagent-20260901-000000-1.log')
  expect(own.filter(name => !name.startsWith('dsh-superagent-superagent-20260901-'))).toHaveLength(1)
  expect(logs.filter(name => name.startsWith('dsh-superagent-other-'))).toHaveLength(25)
  expect(logs).toContain('dsh-superagent-20260901-000000-1.log')
}, 20_000)
it('reports a service whose Feishu bot setup could not check as running, and reads an answer with keys missing', async () => {
  processes(service(sleeper()))
  const feishu = { health: { runtime: { state: 'ready', detail: '' }, feishu: { state: 'paused', detail: '' } },
    setup: { problem: null, feishuProblem: { code: 'feishuNoBot', detail: 'No bot' } } }
  expect(await run('status', '--url', await answering(feishu, true))).toMatchObject({ code: 0 })
  server!.close()
  expect(await run('status', '--url', await answering({ health: { runtime: { state: 'ready' } } }, true))).toMatchObject({ code: 0 })
  server!.close()
  expect(await run('status', '--url', await answering({ health: { runtime: { state: 'error' } } }, true))).toMatchObject({ code: 1 })
})
it('exits 2 while a part such as a Source reports an error, which a restart does not fix, and prints what it reports', async () => {
  processes(service(sleeper()))
  const github = { health: { runtime: { state: 'ready', detail: '' }, github: { state: 'error', detail: 'bad token' } }, setup: {} }
  const url = await answering(github, true)
  const checked = await run('status', '--url', url)
  expect(checked.code).toBe(2)
  expect(JSON.parse(checked.stdout)).toMatchObject({ errors: { github: 'bad token' } })
  expect(await run('start', '--url', url, '--timeout', '10'))
    .toMatchObject({ code: 2, stdout: expect.stringContaining('github reports an error, which a restart does not fix: bad token') })
}, 20_000)
it('exits 3 while the service waits for setup, from status and from start, which a restart does not fix', async () => {
  processes(service(sleeper()))
  const waiting = { health: { runtime: { state: 'paused', detail: '' } },
    setup: { problem: { code: 'repositoryUnset', detail: 'The GitHub Source names no repository.' }, feishuProblem: null } }
  const url = await answering(waiting, true)
  expect(await run('status', '--url', url)).toMatchObject({ code: 3 })
  expect(await run('start', '--url', url, '--timeout', '10'))
    .toMatchObject({ code: 3, stdout: expect.stringContaining('waiting for setup: The GitHub Source names no repository.') })
}, 20_000)
it('restarts the service, and a restart whose graceful stop timed out does not keep recovery off', async () => {
  const url = await answering()
  const old = sleeper(), pid = sleeper()
  processes(service(old))
  writeFileSync(join(root, 'pane'), `${pid}\n`)
  started(service(pid))
  const restarted = await run('restart', '--url', url, '--timeout', '10', '--stop-timeout', '5')
  expect(restarted).toMatchObject({ code: 0, stdout: expect.stringContaining('dsh-superagent stopped.') })
  expect(restarted.stdout).not.toContain('Automatic recovery is paused')
  expect(existsSync(join(control('superagent'), 'manually-stopped'))).toBe(false)
  expect(readFileSync(join(control('superagent'), 'service.pid'), 'utf8')).toBe(`${pid}\n`)
  // A service that does not stop in time is left running, and the next check may restart it.
  rmSync(join(root, 'launched'))
  processes(service(sleeper(true)))
  expect(await run('restart', '--url', url, '--timeout', '10', '--stop-timeout', '1'))
    .toMatchObject({ code: 1, stderr: expect.stringContaining('Graceful stop timed out') })
  expect(await status('superagent')).toMatchObject({ manually_stopped: false })
}, 20_000)
it('refuses a second control operation while one holds the profile\'s lock', async () => {
  mkdirSync(control('superagent'), { recursive: true })
  const held = join(root, 'held')
  const holder = spawn('python3', ['-c', `import fcntl, pathlib, time
lock = open(${JSON.stringify(join(control('superagent'), 'operation.lock'))}, 'a')
fcntl.flock(lock, fcntl.LOCK_EX)
pathlib.Path(${JSON.stringify(held)}).touch()
time.sleep(30)`], { stdio: 'ignore' })
  sleepers.push(holder)
  while (!existsSync(held)) await new Promise(resolve => setTimeout(resolve, 50))
  expect(await run('status')).toMatchObject({ code: 1,
    stderr: expect.stringContaining('Another dsh-superagent control operation is in progress') })
}, 20_000)
it('refuses to start a service while no process runs it but something answers at its URL', async () => {
  const url = await answering(READY, true)
  expect(await run('start', '--url', url, '--timeout', '5'))
    .toMatchObject({ code: 1, stderr: expect.stringContaining('An existing orchestrator answers at this URL') })
  expect(readFileSync(join(root, 'tmux.log'),
    'utf8').split('---\n').filter(Boolean).map(call => call.split('\n')[0])).toEqual(['has-session'])
}, 20_000)
it('starts the service in a new window of the profile\'s tmux session when the session exists', async () => {
  program('tmux', `for a in "$@"; do printf '%s\\n' "$a"; done >> '${root}/tmux.log'; echo --- >> '${root}/tmux.log'\n`
    + `case "$1" in has-session) exit 0;; new-*) touch '${root}/launched'; cat '${root}/pane';; esac`)
  const url = await answering()
  const pid = sleeper()
  writeFileSync(join(root, 'pane'), `${pid}\n`)
  started(service(pid))
  expect(await run('start', '--url', url, '--timeout', '10')).toMatchObject({ code: 0 })
  const calls = readFileSync(join(root, 'tmux.log'), 'utf8').split('---\n').map(call => call.split('\n'))
  expect(calls.find(call => call[0] === 'new-window')).toEqual(expect.arrayContaining(['-t', '=dsh-superagent:']))
  expect(calls.some(call => call[0] === 'new-session')).toBe(false)
}, 20_000)
it('exits 1 when the started service does not answer in time, and leaves its process running', async () => {
  const pid = sleeper()
  writeFileSync(join(root, 'pane'), `${pid}\n`)
  started(service(pid))
  expect(await run('start', '--url', 'http://127.0.0.1:9', '--timeout', '2'))
    .toMatchObject({ code: 1, stderr: expect.stringContaining('Startup health check timed out') })
  expect(() => process.kill(pid, 0)).not.toThrow()
}, 20_000)
it('does not signal a process that took the recorded service PID, and keeps a stop that timed out', async () => {
  mkdirSync(control('superagent'), { recursive: true })
  const other = sleeper()
  processes(`${other} sleep sleep 60`)
  writeFileSync(join(control('superagent'), 'service.pid'), `${other}\n`)
  expect(await run('stop', '--stop-timeout', '1')).toMatchObject({ code: 0 })
  expect(() => process.kill(other, 0)).not.toThrow()
  // A service that does not stop in time keeps the stop, so recovery does not start it again.
  rmSync(join(control('superagent'), 'manually-stopped'))
  processes(service(sleeper(true)))
  expect(await run('stop', '--stop-timeout', '1')).toMatchObject({ code: 1, stderr: expect.stringContaining('Graceful stop timed out') })
  expect(existsSync(join(control('superagent'), 'manually-stopped'))).toBe(true)
}, 20_000)

it('fast-forwards to the remote main, builds, and builds nothing when it is already there', async () => {
  const { first, second } = checkout()
  const ahead = await run('prepare', '--repository', 'acme/widgets')
  expect(ahead).toMatchObject({ code: 0 })
  expect(ahead.stdout).toContain(`prepare: fast-forwarded from ${first.slice(0, 12)} to ${second.slice(0, 12)} on main`)
  expect(ahead.stdout).toContain('$ pnpm install --frozen-lockfile')
  expect(ahead.stdout).toContain('$ pnpm build')
  expect(git('rev-parse', 'HEAD')).toBe(second)
  // A fast-forward produces no merge commit: the new commit has one parent.
  expect(git('rev-list', '--parents', '-n', '1', 'HEAD').split(' ')).toHaveLength(2)
  expect(builds()).toEqual(['install', '--frozen-lockfile', 'build'])
  const idempotent = await run('prepare', '--repository', 'acme/widgets')
  expect(idempotent).toMatchObject({ code: 0 })
  expect(idempotent.stdout).toContain(`prepare: up to date at ${second.slice(0, 12)} on main`)
  expect(builds()).toEqual(['install', '--frozen-lockfile', 'build'])
}, 60_000)
it('resets the checkout to the previous commit and rebuilds it when the new build fails', async () => {
  const { first } = checkout()
  // The first build the stub runs fails; the rebuild after the reset succeeds.
  program('pnpm', `case "$*" in *build*) if [ ! -f '${root}/failed' ]; then touch '${root}/failed'; exit 1; fi;; esac
for a in "$@"; do printf '%s\\n' "$a"; done >> '${root}/pnpm.log'`)
  const failed = await run('prepare', '--repository', 'acme/widgets')
  expect(failed).toMatchObject({ code: 1,
    stderr: expect.stringContaining(`prepare: pnpm build exited with code 1; the checkout is back at ${first.slice(0, 12)} and rebuilt.`) })
  expect(git('rev-parse', 'HEAD')).toBe(first)
  expect(builds()).toEqual(['install', '--frozen-lockfile', 'install', '--frozen-lockfile', 'build'])
}, 60_000)
it('refuses prepare on a dirty checkout, a detached HEAD or another branch, leaving HEAD where it was', async () => {
  const { first } = checkout()
  writeFileSync(join(root, 'dirty.txt'), 'uncommitted\n')
  const dirty = await run('prepare', '--repository', 'acme/widgets')
  expect(dirty).toMatchObject({ code: 1, stderr: expect.stringContaining('this checkout has uncommitted changes') })
  expect(git('rev-parse', 'HEAD')).toBe(first)
  rmSync(join(root, 'dirty.txt'))
  git('checkout', '--detach')
  expect(await run('prepare', '--repository', 'acme/widgets'))
    .toMatchObject({ code: 1, stderr: expect.stringContaining('a detached HEAD; check out main') })
  git('checkout', '-b', 'feature')
  expect(await run('prepare', '--repository', 'acme/widgets'))
    .toMatchObject({ code: 1, stderr: expect.stringContaining('is on feature; check out main') })
  expect(git('rev-parse', 'HEAD')).toBe(first)
  expect(builds()).toEqual([])
}, 60_000)
it('refuses to fast-forward when the local main has commits the remote does not have', async () => {
  checkout()
  writeFileSync(join(root, 'local.txt'), 'local work\n')
  git('add', 'local.txt')
  git('commit', '-m', 'local work')
  const diverged = git('rev-parse', 'HEAD')
  const refused = await run('prepare', '--repository', 'acme/widgets')
  expect(refused).toMatchObject({ code: 1, stderr: expect.stringContaining('this checkout has commits origin/main does not have') })
  expect(git('rev-parse', 'HEAD')).toBe(diverged)
  expect(builds()).toEqual([])
}, 60_000)
it('refuses a --repository the checkout has no remote for, and a missing or malformed one', async () => {
  const { first } = checkout()
  const unmatched = await run('prepare', '--repository', 'other/repo')
  expect(unmatched).toMatchObject({ code: 1, stderr: expect.stringContaining('No remote of this checkout names other/repo') })
  expect(unmatched.stderr).toContain('git remote add origin')
  expect(await run('prepare')).toMatchObject({ code: 1, stderr: expect.stringContaining('prepare needs --repository <owner/name>') })
  expect(await run('activate', '--repository', 'acme')).toMatchObject({ code: 1, stderr: expect.stringContaining('must be owner/name') })
  expect(git('rev-parse', 'HEAD')).toBe(first)
  expect(builds()).toEqual([])
}, 60_000)
it('refuses prepare while another control operation holds the lock, leaving HEAD where it was', async () => {
  const { first } = checkout()
  mkdirSync(control('superagent'), { recursive: true })
  const held = join(root, 'held')
  const holder = spawn('python3', ['-c', `import fcntl, pathlib, time
lock = open(${JSON.stringify(join(control('superagent'), 'operation.lock'))}, 'a')
fcntl.flock(lock, fcntl.LOCK_EX)
pathlib.Path(${JSON.stringify(held)}).touch()
time.sleep(30)`], { stdio: 'ignore' })
  sleepers.push(holder)
  while (!existsSync(held)) await new Promise(resolve => setTimeout(resolve, 50))
  expect(await run('prepare', '--repository', 'acme/widgets')).toMatchObject({ code: 1,
    stderr: expect.stringContaining('Another dsh-superagent control operation is in progress') })
  expect(git('rev-parse', 'HEAD')).toBe(first)
  expect(builds()).toEqual([])
}, 60_000)
it('activates a new commit: backs up the database and restarts on it', async () => {
  const { second } = checkout()
  database()
  const old = sleeper(), next = sleeper()
  processes(service(old))
  writeFileSync(join(root, 'current-pid'), `${old}\n`)
  writeFileSync(join(root, 'pane'), `${next}\n`)
  launching()
  const url = await serving(readyState())
  const activated = await run('activate', '--repository', 'acme/widgets', '--url', url, '--timeout', '10', '--stop-timeout', '5')
  expect(activated).toMatchObject({ code: 0 })
  expect(activated.stdout).toContain('dsh-superagent stopped.')
  expect(activated.stdout).toContain('activate: backed up the database to ')
  expect(activated.stdout).toContain(`activate: ${second.slice(0, 12)} is running on main.`)
  expect(git('rev-parse', 'HEAD')).toBe(second)
  expect(readFileSync(join(control('superagent'), 'service.pid'), 'utf8')).toBe(`${next}\n`)
  expect(existsSync(join(control('superagent'), 'manually-stopped'))).toBe(false)
  const backups = readdirSync(join(root, '.artifacts', 'backups'))
  expect(backups).toHaveLength(1)
  expect(backups[0]).toMatch(/^orchestrator-superagent-\d{8}-\d{6}/)
  const backup = join(root, '.artifacts', 'backups', backups[0]!)
  expect(readFileSync(join(backup, 'orchestrator.sqlite'), 'utf8')).toBe('the database')
  expect(readFileSync(join(backup, 'orchestrator.sqlite-wal'), 'utf8')).toBe('the write-ahead log')
  expect(builds()).toEqual(['install', '--frozen-lockfile', 'build'])
}, 60_000)
it('skips activation while Executor Sessions are working', async () => {
  const old = sleeper()
  processes(service(old))
  writeFileSync(join(root, 'current-pid'), `${old}\n`)
  const url = await serving(readyState(2))
  const idle = await run('activate', '--repository', 'acme/widgets', '--if-idle', '--url', url)
  expect(idle).toMatchObject({ code: 0,
    stdout: expect.stringContaining('2 Executor Session(s) are still working; activation is skipped.') })
  expect(existsSync(join(root, '.artifacts', 'backups'))).toBe(false)
  expect(() => process.kill(old, 0)).not.toThrow()
}, 30_000)
it('skips activation after an intentional stop without reading the service', async () => {
  mkdirSync(control('superagent'), { recursive: true })
  writeFileSync(join(control('superagent'), 'manually-stopped'), '2026-01-01T00:00:00+0000\n')
  const skipped = await run('activate', '--repository', 'acme/widgets', '--respect-stop', '--url', 'http://127.0.0.1:9')
  expect(skipped).toMatchObject({ code: 0, stdout: expect.stringContaining('Intentional stop is active; activation skipped.') })
  expect(existsSync(join(root, '.artifacts', 'backups'))).toBe(false)
}, 20_000)
it('refuses to activate while no service answers, because the state and database are unknown', async () => {
  checkout()
  const refused = await run('activate', '--repository', 'acme/widgets', '--url', 'http://127.0.0.1:9')
  expect(refused).toMatchObject({ code: 1, stderr: expect.stringContaining('activate: nothing answers at http://127.0.0.1:9') })
  expect(builds()).toEqual([])
  expect(existsSync(join(root, 'tmux.log'))).toBe(false)
}, 30_000)
it('skips activation on an up-to-date checkout when --only-when-behind asks for it', async () => {
  checkout()
  database()
  const old = sleeper()
  processes(service(old))
  writeFileSync(join(root, 'current-pid'), `${old}\n`)
  const url = await serving(readyState())
  expect((await run('prepare', '--repository', 'acme/widgets')).code).toBe(0)
  const skipped = await run('activate', '--repository', 'acme/widgets', '--only-when-behind', '--url', url)
  expect(skipped).toMatchObject({ code: 0, stdout: expect.stringContaining('activate: already up to date at ') })
  expect(skipped.stdout).toContain('nothing to activate.')
  expect(skipped.stdout).not.toContain('backed up')
  expect(existsSync(join(root, '.artifacts', 'backups'))).toBe(false)
  expect(() => process.kill(old, 0)).not.toThrow()
}, 60_000)
it('rolls the checkout, the database and the service back when the new build does not start', async () => {
  const { first } = checkout()
  database('the old database')
  const old = sleeper(), previous = sleeper()
  processes(service(old))
  writeFileSync(join(root, 'current-pid'), `${old}\n`)
  writeFileSync(join(root, 'pane'), `${previous}\n`)
  launching(true)
  const url = await serving(readyState())
  const failed = await run('activate', '--repository', 'acme/widgets', '--url', url, '--timeout', '2', '--stop-timeout', '5')
  expect(failed).toMatchObject({ code: 1 })
  expect(failed.stdout).toContain('activate: the new build did not start (Startup health check timed out')
  expect(failed.stdout).toContain(`rolling back to ${first.slice(0, 12)}.`)
  expect(failed.stdout).toContain('activate: restored the database from ')
  expect(failed.stdout).toContain(`activate: rolled back to ${first.slice(0, 12)}; the previous version is running again.`)
  expect(git('rev-parse', 'HEAD')).toBe(first)
  expect(readFileSync(join(root, 'state', 'orchestrator.sqlite'), 'utf8')).toBe('the old database')
  expect(readFileSync(join(root, 'state', 'orchestrator.sqlite-wal'), 'utf8')).toBe('the write-ahead log')
  expect(builds()).toEqual(['install', '--frozen-lockfile', 'build', 'install', '--frozen-lockfile', 'build'])
  expect(readFileSync(join(root, 'ps-started.txt'), 'utf8'))
    .toContain(`${previous} node node /opt/dsh --profile superagent --no-open`)
  expect(readFileSync(join(control('superagent'), 'service.pid'), 'utf8')).toBe(`${previous}\n`)
}, 60_000)
