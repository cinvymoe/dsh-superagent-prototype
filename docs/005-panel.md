# 005 Panel

Open **Superagent** in the DeepSeek Harness Web sidebar to supervise the agent. The panel prioritizes work that needs a person, then system health and history. This document builds on [000 Philosophy](000-philosophy.md) through [004 Prompts](004-prompts.md).

## Three questions

Opening the panel answers three questions, in this order:

1. Does anything need me now?
2. Is the system healthy and doing the right things?
3. What is the history of one piece of work, from Trigger through Eval to Ticket?

## Tabs

The tabs follow the workflow: **Overview**, **New requirement**, **Requirements**, **Source**, **Trigger**, **Eval**, **Execution**, and **Settings**. Until repository and account setup succeeds, Overview shows what is missing and links to the relevant setting.

Above the page tabs, the project bar shows one tab per local project and marks the current one. When the project tabs overflow, **More** at the end of the strip lists every project. **New project** at the top right opens a separate page; Cancel or Back there creates nothing, and creating a project makes it current and returns to its requirement list.

| Tab | Shows |
| --- | --- |
| Overview | Tickets needing action, system problems, activity counts for the last 24 hours, and Executor load. Each block links to its detailed page |
| New requirement | Submission page of the current local project. The page head shows its name, the repository chain it owns (intake repository → code repository, each `owner/name`) and an optional absolute `worktreeRoot` (empty keeps the Execution ticket directory root); it has no back button and no requirement list. One description field takes the text: its first non-empty line becomes the title, with whitespace collapsed and shortened to 200 characters, while the whole description is stored as the body. **Choose images** attaches up to four PNG, JPEG, WebP or GIF files of at most 5 MiB each; each shows a thumbnail and its file name and can be removed before submitting. Submit stays disabled while the description is blank. With no projects it shows a hint to create one first; project creation and switching live in the project bar |
| Requirements | Requirements of the current local project, newest first, each with its state, alignment tag, creation time, slice count and image count. A filter row offers 待处理, 已确认, 已关闭 and 全部 in that order; 待处理 is the default and lists the open requirements with no alignment, a pending proposal or a rejection, 已确认 lists the open ones whose alignment was confirmed, 已关闭 lists the closed ones and 全部 lists every requirement. Choosing a filter replaces the current entry instead of adding a back step, and the chosen filter is kept when a requirement detail returns to this list and when the project switches. A row opens the requirement detail, which shows the whole description once, its images in submission order, the message timeline, the linked Tickets and the read-only alignment proposal; its back button returns to this list rather than Overview. The message timeline lists the newest message first, with the follow-up box above the list: a submitted message appears at the top, the count grows and the box clears, and the earliest message falls to the bottom. The page head shows the project's repository chain (intake repository → code repository). Confirming an alignment dispatches one Ticket per slice, and each Ticket executes through that chain. With no projects it shows a hint to create one first |
| Source | Source state, setup problems and non-zero counts. Filtered Triggers and dropped messages cover the same 24-hour window as Overview |
| Trigger | Threads filtered by Subscribed, Evaluating, New Triggers in 24 h, or All Threads. Each Thread shows its Triggers newest first, Decisions and Subscriptions |
| Eval | Decisions with their reason and matched rules |
| Execution | Executor state, Pause processing, and Tickets filtered by Open, Pending, Working, Waiting for a Trigger or Ended; Clear filters returns to Open from any other filter. Ticket details show actions, authorization, waiting Inputs, Subscriptions and Assignments |
| Settings | Sources, Eval, Execution, Prompts and Deployment. Each group includes its save history |

### Projects

Each local project owns one GitHub repository chain and has a project name, an intake repository, a code repository and an optional worktree root. **Project name** labels the project in the project bar and on its requirements. **Intake repository** is the `owner/name` repository whose Issues the project receives. **Execution repository** is the `owner/name` repository that executes the project's requirements, and it is their only execution target; it is the project chain's code repository. The project's chain is stored in the GitHub Source's repository chains under the project's id, so creating or editing a project only adds or changes that project's chain and leaves every other project's chain untouched. **Worktree root** is an optional absolute directory root for the project's Tickets; empty keeps the Execution ticket directory root.

When dsh-superagent starts, a project stored by an older version with only an execution repository is bound to the existing chain whose code repository is that repository, without changing the chain configuration; a project with no matching chain keeps executing in its original repository. The project bar above the page tabs selects the current project; the requirements, their page head and a new requirement all follow it. **New project** on the bar opens its own page, and **Edit project** on the New requirement page head opens the same form for the current project with its four fields already filled in. Cancel or Back on either page writes nothing. Saving the form reloads the projects, makes the saved project current and returns to its requirements — the requirement list after creating and the New requirement page after editing — so editing one project changes only that project's chain and leaves every other project's two repositories as they were. A refused save shows the localized reason and keeps the page and the typed values.

A configured worktree root must already exist and accept writes; otherwise the Ticket fails to launch instead of falling back to the Execution ticket directory root.

### Requirement images

**Choose images** on New requirement attaches up to four files to one requirement. The limits are PNG, JPEG, WebP or GIF only, at most 5 MiB per image and at most 4 images; the form states them below the button.

- The client refuses an unsupported type, an oversized file or a selection that would exceed four images, shows the reason and adds nothing, so no request is made. The already chosen images stay.
- Submitting sends the description and the images in one create request, so the requirement exists with all of them or with none.
- When the host refuses the create, the description and the chosen images stay on the page and the localized error appears; nothing is cleared before the request succeeds.
- The detail shows the images in submission order, each with its file name and byte size. The list row adds the image count.

Images are read through the same-origin management API (`GET /orchestrator/api/local/issues/<id>/images/<imageId>` with the `x-orchestrator-request` header) and rendered from an object URL, so there is no unauthenticated image URL and no `<img src>` request without that header.

### Reading individual records

A dropped message links to its Ticket, or to its Thread when it has no Ticket. The Source page explains whether its conversation disappeared or the Source stopped listening to it.

A human follow-up still owned by an Executor is marked **Delivered to Ticket**, without an Eval. The Thread also shows hand-back reasons and context-only Subscriptions. **Evaluate again** can send that follow-up to Eval, or retry a Trigger with no effective judgement: one filtered by its Source, an unavailable Eval, or a delivered message with neither a non-stop Decision nor an Executor acknowledgement.

Ticket details show the originating Trigger, Decision and reason, scope and Policy version. Assignments and secondary details are folded below the immediate actions. **Retry** is available for failed Input delivery or a Ticket waiting for a person after a blocked or failed Report. Ended Tickets show outcomes such as **Pull request merged** or **Stopped by a person**.

## Settings groups

- **Sources:** one card per Source with its switch, fields and verified account facts. The local source backs the New requirement and Requirements pages; its projects, issues and replies stay in this installation, and each project owns a GitHub repository chain (intake repository → code repository) stored in the GitHub Source's repository chains, whose code repository is the execution target for its requirements; its `worktreeRoot` (when set; empty keeps the Execution root) is the directory root for their Tickets. GitHub also offers receive-all switches for new Issues, pull requests, comments and default-branch CI. Polling and read limits are under Advanced.
- **Eval:** the Policy version and rules, followed by **On each Source** and the Eval settings. Each Source tab contains its allowed list, membership sync, admission table and bot list. Sync runs at startup and on **Sync now**. The admission table distinguishes receiving scope, sender membership and whether the message addresses the agent. Eval settings select the accept mode, timeout and assessment model.
- **Execution:** Executor model, concurrent Tickets, the Ticket directory root (`executor.directory`; empty uses `<stateDir>/work`), prepare command and blocked commands. A local project's `worktreeRoot` takes precedence over the Ticket directory root; an explicitly set root must already exist and be writable, or its Tickets fail to launch instead of falling back. The prepare command runs in the selected root. Clicking an available variable inserts it into the prepare command.
- **Prompts:** **Edit** changes team sections, built-in parts and skills. **Full prompt** shows the assembled text and compares it with saved text or defaults. **History** lists versions. Edited built-in parts are marked changed and can be reset; templates list their required placeholders.

  An upgrade that changes an overridden default marks it **Default updated** (默认内容已更新). The panel compares the old and new defaults above the team's text. If the old default was not recorded, it compares the team's text with the new default instead. Choose **Keep my text** or **Use the new default**. Overrides for removed parts are listed below the tab bar and dropped on the next save.
- **Deployment:** startup problems with **Check again**, the state directory and machine limits. Saved limits apply without restart. The DeepSeek Harness Plugin Manager exposes the same page.

## Search

The header search finds Triggers by text, id, Feishu message id or a stored link, such as a GitHub comment URL. A Feishu link missing from the original message becomes searchable only after the host reads it during the current process lifetime.

Search also finds Threads by references such as `#12` or a GitHub URL, and Tickets by title or a matching Thread.

## Principles

1. **Focus on what matters.** Every element answers one of the three questions, or it is removed. A number appears only when it changes what the supervisor does.
2. **Precise definitions.** Categories have checkable definitions, are mutually exclusive and cover every case, as the Ticket stages do. A label says whom a row waits for and what it needs, not an internal status code.
3. **One place per concept.** Source state belongs in Source; Threads and Triggers in Trigger; Decisions in Eval; Tickets in Execution. Settings are grouped by the concept they configure. Overview summarizes these pages and links to them instead of becoming another detailed view.
4. **Domain structure.** The panel uses the domain terms. Internal identifiers appear only in folded details, and names replace identifiers where they can be resolved.
5. **Honest state.** A count equals the length of the list it links to, and no state contradicts another fact.
6. **Quiet by default.** Healthy states take no extra space. Problems must be actionable; a one-off network error is not enough. Rows needing a person offer their action directly. Keep page explanations to one sentence and put further detail in the (?) tooltip. Destructive actions require confirmation.
7. **Consistent controls.** Use DeepSeek Harness design tokens and control behavior. The same information should look the same throughout the panel. Each settings block has one save bar, visible only while changes exist, a save runs or a save fails.
