/**
 * The tools a discussion's Answerer is offered. Reading the workspace is its default; asking the person is the one thing it
 * may do beyond reading, and it writes the discussion's own record only: no Trigger, no Ticket, no Eval.
 */
import { z } from 'zod'
import type { LocalAsk, LocalDiscussion } from '../../sources/local-format.ts'
import { tool, type Tool } from './tool.ts'

/** What `discussion_ask` needs from the host: the discussion this Session answers, and the record it writes the ask on. */
export interface DiscussionToolsHost {
  /** The discussion this Answerer Session answers. */
  readonly discussionId: string
  /** The discussion as stored now, so a second ask in one turn sees that the first is still open. */
  discussion(): LocalDiscussion | undefined
  /** Records the ask on that discussion; a refusal reaches the model as the `UserError` message it names. */
  ask(questions: { question: string; options?: string[] }[]): LocalAsk | undefined
}

/**
 * The Answerer's asking tool. It is deliberately not a wait: the questions are recorded and the turn ends, the panel shows
 * one card, and the person's answers come back as the discussion's next message. That keeps a discussion off the answering
 * queue's slots, survives a restart, and leaves the person free to answer whenever they read the discussion.
 */
export function discussionTools(host: DiscussionToolsHost): Tool[] {
  return [tool({
    name: 'discussion_ask',
    description: 'Ask the person what the repository cannot tell you, when one to three concrete answers would settle the '
      + 'discussion. Each question may offer up to four answers as buttons. The questions become one card in the panel; the '
      + 'person answers it, and their answers arrive as the next message of this discussion, so end your reply right after '
      + 'calling this instead of guessing. Ask only what the person owns — scope, taste, trade-offs, priorities; never ask '
      + 'for permission, never ask what reading the code would answer, and never ask again what was already settled.',
    schema: z.object({
      questions: z.array(z.object({
        question: z.string().trim().min(1).describe('One question, at most a couple of sentences, phrased so a short answer is possible.'),
        options: z.array(z.string().trim().min(1)).max(4).optional()
          .describe('The answers worth offering as buttons, the most likely first; omit when only free text can answer.'),
      })).min(1).max(3).describe('The questions, most important first, three at most; one is better than three.'),
    }).strict(),
    execute: async args => {
      const discussion = host.discussion()
      if (!discussion) return { recorded: false, reason: 'This discussion no longer exists; there is nobody left to ask.' }
      const ask = host.ask(args.questions)
      return { recorded: ask !== undefined, ask: ask?.id, state: ask?.state,
        next: 'The person answers in the panel and those answers arrive as the next message of this discussion: end your reply now.' }
    },
  })]
}
