import { eatInputToIso } from '@/lib/time'
import type { DraftQuestion, ExamDraft } from './types'
import { OPTION_LETTERS } from './types'

/**
 * Client-side mirror of private.exam_payload_problems() for instant feedback in the
 * preview table. The server re-validates everything; this is only UX.
 */
export type Problem = { key: string; values?: Record<string, string | number> }

export function questionProblems(q: DraftQuestion): Problem[] {
  const p: Problem[] = []
  if (!q.body.trim()) p.push({ key: 'problems.emptyQuestion' })
  if (q.options.length !== 4) {
    p.push({ key: 'problems.optionCount', values: { count: q.options.length } })
  } else {
    const empty = q.options
      .map((o, i) => (o.trim() ? null : OPTION_LETTERS[i]))
      .filter((x): x is NonNullable<typeof x> => x != null)
    if (empty.length) p.push({ key: 'problems.emptyOptions', values: { letters: empty.join(', ') } })
  }
  if (!q.correct) p.push({ key: 'problems.missingAnswer' })
  if (!Number.isInteger(q.points) || q.points < 1 || q.points > 100) p.push({ key: 'problems.points' })
  return p
}

/** Numbering gaps / duplicates across the whole list (matters for uploaded files). */
export function numberingProblems(questions: DraftQuestion[]): Problem[] {
  if (questions.length === 0) return []
  const counts = new Map<number, number>()
  for (const q of questions) counts.set(q.number, (counts.get(q.number) ?? 0) + 1)

  const p: Problem[] = []
  const dups = [...counts].filter(([, c]) => c > 1).map(([n]) => n).sort((a, b) => a - b)
  if (dups.length) p.push({ key: 'problems.numberingDuplicate', values: { numbers: dups.join(', ') } })

  const missing: number[] = []
  for (let n = 1; n <= questions.length; n++) if (!counts.has(n)) missing.push(n)
  if (missing.length) {
    const shown = missing.slice(0, 10).join(', ') + (missing.length > 10 ? '…' : '')
    p.push({ key: 'problems.numberingGap', values: { numbers: shown } })
  }
  return p
}

/** nowMs must be SERVER time (useServerClock), never Date.now(): device clocks can be hours off. */
export function examProblems(draft: ExamDraft, opts: { publish: boolean; nowMs: number }): Problem[] {
  const p: Problem[] = []
  const title = draft.title.trim().length
  const subject = draft.subject.trim().length
  if (title < 3 || title > 200) p.push({ key: 'problems.title' })
  if (subject < 2 || subject > 80) p.push({ key: 'problems.subject' })

  const duration = Number(draft.duration)
  const durationOk = /^\d+$/.test(draft.duration) && duration >= 1 && duration <= 600
  if (!durationOk) p.push({ key: 'problems.duration' })

  const hasStart = draft.windowStart !== ''
  const hasEnd = draft.windowEnd !== ''
  if (!hasStart && !hasEnd) {
    if (opts.publish) p.push({ key: 'problems.windowRequired' })
  } else {
    const s = eatInputToIso(draft.windowStart)
    const e = eatInputToIso(draft.windowEnd)
    if (!s || !e) p.push({ key: 'problems.windowInvalid' })
    else {
      const ms = new Date(e).getTime() - new Date(s).getTime()
      if (ms <= 0) p.push({ key: 'problems.windowOrder' })
      else if (durationOk && ms < duration * 60_000) p.push({ key: 'problems.windowTooShort' })
      else if (opts.publish && new Date(e).getTime() <= opts.nowMs) p.push({ key: 'problems.windowEnded' })
    }
  }

  if (draft.questions.length === 0) p.push({ key: 'problems.noQuestions' })
  if (draft.questions.length > 300) p.push({ key: 'problems.tooManyQuestions' })
  return p
}

export type DraftReport = {
  byQuestion: Map<string, Problem[]>
  list: Problem[]
  exam: Problem[]
  questionProblemCount: number
  /** zero problems of any kind (what Publish requires) */
  publishable: boolean
  /** questions valid + exam meta valid without a window requirement (what Save draft requires) */
  savable: boolean
}

export function analyzeDraft(draft: ExamDraft, nowMs: number): DraftReport {
  const byQuestion = new Map<string, Problem[]>()
  let questionProblemCount = 0
  for (const q of draft.questions) {
    const qp = questionProblems(q)
    if (qp.length) {
      byQuestion.set(q.key, qp)
      questionProblemCount += qp.length
    }
  }
  const list = numberingProblems(draft.questions)
  const examForPublish = examProblems(draft, { publish: true, nowMs })
  const examForDraft = examProblems(draft, { publish: false, nowMs })
  const questionsOk = questionProblemCount === 0 && list.length === 0
  return {
    byQuestion,
    list,
    exam: examForPublish,
    questionProblemCount,
    publishable: questionsOk && examForPublish.length === 0,
    savable: questionsOk && examForDraft.length === 0,
  }
}
