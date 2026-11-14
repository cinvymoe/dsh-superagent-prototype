import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const NUMBERED = /^(\d{3})-[a-z0-9-]+\.md$/
const numbered = readdirSync(join(ROOT, 'docs')).filter(name => NUMBERED.test(name)).sort()
const entries = ['README.md', 'SETUP.md']
const documents = [...entries, ...readdirSync(join(ROOT, 'docs')).filter(name => name.endsWith('.md')).map(name => `docs/${name}`)]
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8')
/** A document's text with every run of whitespace collapsed, so a sentence can be matched across line wrapping. */
const prose = (path: string): string => read(path).replace(/\s+/g, ' ')
function links(file: string): string[] {
  return [...readFileSync(file, 'utf8').matchAll(/\]\(([^)\s]+)\)/g)].map(match => match[1]!.split('#')[0]!).filter(target => target && !/^[a-z]+:/.test(target))
}
const files = (directory: string): string[] => readdirSync(join(ROOT, directory), { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile()).map(entry => relative(ROOT, join(entry.parentPath, entry.name)))
/**
 * Extract repo-relative file paths from the first column of a table under `## <heading>` in `docs/007-architecture.md`.
 * Bare filenames inherit the directory of the preceding path in the same cell.
 */
function listed(heading: string): string[] {
  const lines = read('docs/007-architecture.md').split('\n')
  const start = lines.indexOf(`## ${heading}`)
  const end = lines.findIndex((line, index) => index > start && line.startsWith('## '))
  // The first two rows are the header and its separator.
  const rows = lines.slice(start, end < 0 ? undefined : end).filter(line => line.startsWith('| ')).slice(2)
  return rows.flatMap(row => {
    let directory = ''
    return [...row.split('|')[1]!.matchAll(/`([^`]+)`/g)].map(([, name]) => {
      if (!name!.includes('/')) return join(directory, name!)
      directory = dirname(name!)
      return name!
    })
  })
}

describe('documentation', () => {
  it('numbers documents consecutively from 000', () => {
    expect(numbered.map(name => name.slice(0, 3))).toEqual(numbered.map((_, index) => String(index).padStart(3, '0')))
  })
  it('links numbered documents only to earlier numbered documents', () => {
    const violations = numbered.flatMap(name => links(join(ROOT, 'docs', name)).flatMap(target => {
      const linked = resolve(ROOT, 'docs', target)
      if (!linked.endsWith('.md')) return []
      const number = NUMBERED.exec(linked.slice(linked.lastIndexOf('/') + 1))?.[1]
      return dirname(linked) === join(ROOT, 'docs') && number !== undefined && number < name.slice(0, 3) ? [] : [`${name} → ${target}`]
    }))
    expect(violations).toEqual([])
  })
  it('resolves every local link', () => {
    const files = [...entries.map(name => join(ROOT, name)), ...numbered.map(name => join(ROOT, 'docs', name))]
    const missing = files.flatMap(file => links(file).filter(target => !existsSync(resolve(dirname(file), target))).map(target => `${file.slice(ROOT.length + 1)} → ${target}`))
    expect(missing).toEqual([])
  })
  it('leaves no merge conflict markers in any document', () => {
    expect(documents.filter(path => /^(<{7}|>{7}) /m.test(read(path)))).toEqual([])
  })
  it('lists every module of src in the module table of 007 Architecture, and only files that exist', () => {
    const modules = listed('Modules')
    expect(files('src').filter(path => !modules.includes(path))).toEqual([])
    expect(modules.filter(path => !existsSync(join(ROOT, path)))).toEqual([])
  })
  it('lists every test in the test table of 007 Architecture, and only files that exist', () => {
    const tests = listed('Tests')
    expect(files('tests').filter(path => /\.spec\.tsx?$/.test(path) && !tests.includes(path))).toEqual([])
    expect(tests.filter(path => !existsSync(join(ROOT, path)))).toEqual([])
  })
})

describe('worktree root documentation', () => {
  it('states the directory root priority and that the prepare command runs in the chosen root', () => {
    const execution = prose('docs/003-execution.md')
    expect(execution).toContain('chosen by priority: the local project\'s `worktreeRoot` > `executor.directory` > `<stateDir>/work`')
    expect(execution).toContain('the prepare command runs once with `sh` and the chosen root as its working directory')
  })
  it('states that an explicit root failure does not fall back and can be retried after it is fixed', () => {
    const execution = prose('docs/003-execution.md')
    expect(execution).toContain('fails the Ticket with the absolute path and the reason')
    expect(execution).toContain('never falls back')
    expect(execution).toContain('Fix the root, then retry the Ticket or write on its Thread: preparation runs again.')
  })
  it('covers the same semantics in the deployment Execution step and executor block', () => {
    const deployment = prose('docs/006-deployment.md')
    expect(deployment).toContain('chosen by priority: a local project\'s optional absolute `worktreeRoot` > the Ticket directory root (`executor.directory`) > `<stateDir>/work`')
    expect(deployment).toContain('The prepare command runs with that root as its working directory; it creates the repository checkout at `$DSH_SUPERAGENT_DIR` but does not choose the root.')
    expect(deployment).toContain('a local project\'s `worktreeRoot` takes precedence over it')
    expect(deployment).toContain('either explicitly configured root must already exist, be a directory and be writable when a Ticket launches')
    expect(deployment).toContain('without creating anything or falling back to `<stateDir>/work`')
  })
  it('names the Discuss project fields and the Execution root in the panel document', () => {
    const panel = prose('docs/005-panel.md')
    expect(panel).toContain('an optional absolute `worktreeRoot` (empty keeps the Execution ticket directory root)')
    expect(panel).toContain('**Project name** labels the project')
    expect(panel).toContain('**Execution repository** is the `owner/name` repository')
    expect(panel).toContain('the Ticket directory root (`executor.directory`; empty uses `<stateDir>/work`)')
    expect(panel).toContain('A local project\'s `worktreeRoot` takes precedence over the Ticket directory root')
    expect(panel).toContain('The prepare command runs in the selected root.')
  })
  it('describes the worktree root in the module and test table entries this feature touches', () => {
    const architecture = prose('docs/007-architecture.md')
    expect(architecture).toContain('its `prepareDirectory` validation of an explicit worktree root and the prepare command\'s working directory')
    expect(architecture).toContain('creates a project or edits the current one, with its name, intake and code repositories and optional worktree root')
    expect(architecture).toContain('`Execution` with its optional explicit `worktreeRoot`')
    expect(architecture).toContain('the worktree-root sections state the root priority, the prepare working directory and the no-fallback failure')
  })
  it('states that a local project\'s own prepare command replaces the Execution command for its Tickets', () => {
    const execution = prose('docs/003-execution.md'), panel = prose('docs/005-panel.md'), deployment = prose('docs/006-deployment.md'),
      architecture = prose('docs/007-architecture.md')
    expect(execution).toContain('A local project\'s own `prepare` command replaces the Execution setting for its Tickets')
    expect(panel).toContain('A local project\'s own `prepare` command replaces it for that project\'s Tickets')
    expect(deployment).toContain('A local project\'s optional `prepare` command replaces this command for its own Tickets')
    expect(architecture).toContain('The prepare command is the Ticket\'s local project\'s own `prepare` command when it sets one, and otherwise `executor.prepare`')
  })
})

describe('project edit documentation', () => {
  it('states that the same form edits the current project, pre-filled, and that Cancel or Back writes nothing', () => {
    const panel = prose('docs/005-panel.md')
    expect(panel).toContain('**Edit project** on the New requirement page head opens the same form for the current project with its fields already filled in')
    expect(panel).toContain('Cancel or Back on either page writes nothing')
  })
  it('states that saving reloads and returns, an edit changes only that project, and a refusal keeps the page', () => {
    const panel = prose('docs/005-panel.md')
    expect(panel).toContain('Saving the form reloads the projects, makes the saved project current and returns to its requirements — the requirement list after creating and the New requirement page after editing')
    expect(panel).toContain('editing one project changes only that project\'s chain and leaves every other project\'s two repositories as they were')
    expect(panel).toContain('A refused save shows the localized reason and keeps the page and the typed values')
  })
  it('states that an intake repository belongs to one chain and that a project chain cannot be dropped from the Source', () => {
    const panel = prose('docs/005-panel.md'), architecture = prose('docs/007-architecture.md')
    expect(panel).toContain('An intake repository belongs to one chain only')
    expect(panel).toContain('Deleting or renaming a chain a project uses is refused with that project named')
    expect(architecture).toContain('an intake repository may belong to only one chain')
    expect(architecture).toContain('a chain a project uses cannot be deleted or renamed from the Source card')
  })
  it('names the edit page in the route and project form module rows and the isolation test row', () => {
    const architecture = prose('docs/007-architecture.md')
    expect(architecture).toContain('the create page and the project edit page')
    expect(architecture).toContain('the standalone form that creates a project or edits the current one')
    expect(architecture).toContain('editing one project without changing another project\'s repositories')
  })
})

describe('requirement message timeline documentation', () => {
  it('states that the message timeline lists the newest message first with the follow-up box above the list', () => {
    const panel = prose('docs/005-panel.md')
    expect(panel).toContain('The message timeline lists the newest message first, with the follow-up box above the list')
    expect(panel).toContain('a submitted message appears at the top, the count grows and the box clears, and the earliest message falls to the bottom')
  })
  it('names the newest-first timeline and its top box in the module row and the panel test row', () => {
    const architecture = prose('docs/007-architecture.md')
    expect(architecture).toContain('where the timeline lists the newest message first and the follow-up box sits above the list so a submitted message lands at the top')
    expect(architecture).toContain('its newest-first message timeline with the follow-up box above the list (a post appears first and clears the box)')
  })
})

describe('requirement state documentation', () => {
  it('states the three requirement states, both end kinds and the derived, unstored label', () => {
    const panel = prose('docs/005-panel.md')
    expect(panel).toContain('The state is Open, Pending close once every slice Ticket of a confirmed alignment has ended, or Closed; the alignment tag stays Confirmed')
    expect(panel).toContain('Both ways a slice Ticket ends count — an Executor\'s result report and a person\'s stop — so Pending close means execution has stopped and only closing is left, not that every slice succeeded')
    expect(panel).toContain('The label is derived when the panel reads the requirement, not stored: if a Ticket resumes, the label returns to Open')
  })
  it('names the derived view and the shared slice-ticket id in the module rows', () => {
    const architecture = prose('docs/007-architecture.md')
    expect(architecture).toContain('`planTicketId` is the one source of a slice Ticket\'s id, shared by plan dispatch and the requirement view')
    expect(architecture).toContain('`view()`, the derived requirement view whose `slicesFinished` holds once a confirmed alignment has slices and every slice\'s Ticket exists and ended (zero slices or a missing Ticket reports false)')
    expect(architecture).toContain('every local route that returns a requirement answers with `LocalIssues.view()` rather than the stored record')
  })
  it('names the requirement state tag and the completion view in the module and test rows', () => {
    const architecture = prose('docs/007-architecture.md')
    expect(architecture).toContain('the requirement state tag shows Open, Pending close or Closed from the view\'s `slicesFinished` while the alignment tag beside it is unchanged')
    expect(architecture).toContain('the derived requirement completion view (`slicesFinished`) over the HTTP routes, for both end kinds and anomalous alignments')
    expect(architecture).toContain('the Pending close state tag beside the unchanged Confirmed tag on the list row and detail head')  })
})

describe('requirement alignment history documentation', () => {
  it('states that a list row shows its alignment round count and the detail expands only the current round', () => {
    const panel = prose('docs/005-panel.md')
    expect(panel).toContain('slice count, alignment round count and image count')
    expect(panel).toContain('The detail expands the current round with its summary, slices, acceptance criteria and decision time, and keeps every earlier round collapsed until a person expands it, where that round\'s status, time and rejection reason stay readable')
  })
  it('states that Confirm alignment and Send back act only on the current proposed round and name that round', () => {
    const panel = prose('docs/005-panel.md')
    expect(panel).toContain('**Confirm alignment** and **Send back** appear only on the current round while it is proposed and the decision names that round')
  })
  it('names the round history in the panel module row and the panel test row', () => {
    const architecture = prose('docs/007-architecture.md')
    expect(architecture).toContain('the alignment round history renders the current round expanded with earlier rounds collapsed until opened, and every decision names the current round')
    expect(architecture).toContain('the alignment round history (a list row\'s round count, the expanded current round, an earlier round opened on demand and a decision naming the current round)')  })
})

describe('local checkout flow documentation', () => {
  it('walks a merged pull request to a running version with the expected script output', () => {
    const deployment = prose('docs/006-deployment.md')
    expect(deployment).toContain('A merged pull request changes the repository, not the running process.')
    expect(deployment).toContain('prepare: fast-forwarded from <old sha> to <new sha> on main')
    expect(deployment).toContain('"restartRequired": false')
    expect(deployment).toContain('The plugin never restarts the process that loaded it.')
    expect(deployment).toContain('never point them at a host profile')
    expect(deployment).toContain('--only-when-behind --if-idle --respect-stop')
    expect(deployment).toContain('Both prompts report only when a check acted or failed.')
  })
  it('names the running checkout and the pull-and-build action in the panel document', () => {
    const panel = prose('docs/005-panel.md')
    expect(panel).toContain('**Running checkout**, the checkout the running plugin loads')
    expect(panel).toContain('**Pull and build**')
  })
  it('states in the architecture document that rebuilt code needs the loading process to restart', () => {
    const architecture = prose('docs/007-architecture.md')
    expect(architecture).toContain('A rebuilt checkout takes effect only when the process that loaded it restarts')
  })
})
