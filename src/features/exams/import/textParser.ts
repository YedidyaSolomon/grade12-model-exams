import { newQuestionKey, OPTION_LETTERS, type DraftQuestion, type OptionLetter } from '../types'
import { IMAGE_MARK, ImportError, MAX_IMPORTED_QUESTIONS, type ImportResult, type ImportWarning } from './common'

/**
 * Turns the lines of a Word or PDF exam paper into questions. Supported layout:
 *
 *   1. Question text (may continue on the next lines)
 *   A. option   B. option   C. option   D. option   (one per line, or several per line)
 *   Answer: B
 *
 * Option markers may be "A.", "A)", "(A)" or lower case ("a."). Instead of Answer lines the
 * file may end with an answer key ("Answer key: 1-B, 2-C, 3.A" or one pair per line).
 *
 * Like the spreadsheet import, nothing is "fixed" silently: a missing answer, a wrong
 * option count or a numbering gap comes through as-is and is flagged in the preview.
 */

type Style = '.' | ')' | '()'

type Draft = {
  number: number
  body: string[]
  options: string[]
  answer: OptionLetter | null
  rawAnswer: string | null
  images: number
  outOfOrder: boolean
}

export type ParseOptions = {
  /** How body lines are joined: "\n" for Word (each paragraph is deliberate), " " for PDF (wrapped lines). */
  joinBody: '\n' | ' '
}

// "1. text", "1) text", "(1) text", "Q1. text", "Question 1: text". Needs a space (or the
// end of the line) after the marker so "2.5 kg" isn't read as question 2.
const QUESTION_START =
  /^(?:(?:q|question)\s*\.?\s*)?(?:\((\d{1,3})\)|(\d{1,3})\s*[.):])(?=\s|$)\s*(.*)$/i
const QUESTION_START_Q = /^(?:q|question)\s*(\d{1,3})(?=\s|$)\s*(.*)$/i

// "A. text", "A) text", "(A) text", "a. text" at the start of a line.
const OPTION_START = /^(?:\(([A-Da-d])\)|([A-Da-d])\s*([.)]))(?=\s|$)\s*(.*)$/

const KEY_HEADER = /^(?:answer\s*key|answers?\s*sheet|key\s*answers?|answers|key)\b\s*[:.\-–]?\s*(.*)$/i
// "Answer: B", "Ans - c", "Correct answer is (B)". The letter must stand alone.
const ANSWER_LINE = /^(?:correct\s+answer|answer|ans)\s*(?:is\s*)?[:.\-–=]\s*\(?([^\s().]{1,3})\)?\.?(?:\s.*)?$/i
const ANSWER_LINE_BARE = /^(?:correct\s+answer|answer|ans)\s+(?:is\s+)?\(?([A-Da-d])\)?\.?$/i
// "... D. 7   Answer: B" at the end of an option or question line.
const ANSWER_SUFFIX = /\s+(?:correct\s+answer|answer|ans)\s*[:=\-–]\s*\(?([A-Za-z])\)?\.?\s*$/i
// Answer-key pairs: "1-B", "2.C", "3) d", "4 A", "5:(B)".
const KEY_PAIR = /(\d{1,3})\s*[-.):=]?\s*\(?([A-Da-d])\)?(?![A-Za-z])/g

export function normalizeLine(s: string): string {
  return s
    .replace(/[   \t]/g, ' ')
    .replace(/[​‎‏﻿]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function toLetter(raw: string): OptionLetter | null {
  const s = raw.trim().toUpperCase()
  return (OPTION_LETTERS as readonly string[]).includes(s) ? (s as OptionLetter) : null
}

function markerPattern(letter: string, style: Style): RegExp {
  const l = `[${letter.toUpperCase()}${letter.toLowerCase()}]`
  const m = style === '()' ? `\\(${l}\\)` : `${l}\\${style}`
  return new RegExp(`(^|\\s)${m}(?=\\s|$)`, 'g')
}

/**
 * Splits "A. 4  B. 5  C. 6  D. 7" (starting at `fromIndex`, e.g. 2 for a line starting
 * with "C.") into option texts. Only markers of the SAME style, in letter order, count,
 * so "vitamin C. deficiency" in an "A)" list is left alone.
 */
export function splitInlineOptions(
  text: string,
  style: Style,
  fromIndex: number,
): { before: string; options: string[] } | null {
  const hits: { index: number; end: number }[] = []
  let pos = 0
  for (let li = fromIndex; li < 6; li++) {
    const letter = 'ABCDEF'[li]!
    const re = markerPattern(letter, style)
    re.lastIndex = pos
    const m = re.exec(text)
    if (!m) break
    const index = m.index + m[1]!.length
    hits.push({ index, end: m.index + m[0].length })
    pos = m.index + m[0].length
  }
  if (hits.length === 0) return null
  const options = hits.map((h, i) => text.slice(h.end, hits[i + 1]?.index ?? text.length).trim())
  return { before: text.slice(0, hits[0]!.index).trim(), options }
}

/** Options written on the question line itself: "1. 2 + 3 = ? A. 4 B. 5 C. 6 D. 7". */
function findInlineOptionsInText(text: string): { before: string; options: string[] } | null {
  for (const style of ['.', ')', '()'] as const) {
    const r = splitInlineOptions(text, style, 0)
    if (r && r.options.length >= 2 && r.before !== '') return r
  }
  return null
}

function keyPairs(text: string): [number, OptionLetter][] {
  const out: [number, OptionLetter][] = []
  for (const m of text.matchAll(KEY_PAIR)) out.push([Number(m[1]), m[2]!.toUpperCase() as OptionLetter])
  return out
}

function onlyPairs(text: string, min: number): boolean {
  return keyPairs(text).length >= min && text.replace(KEY_PAIR, '').replace(/[\s,;|/]/g, '') === ''
}

/** A line made only of answer-key pairs ("1-B, 2-C, 3-A"), with at least two pairs. */
function isKeyOnlyLine(text: string): boolean {
  return onlyPairs(text, 2)
}

/**
 * "Answer key", "Answers:" or "Answer key: 1-B, 2-C" → the text after the heading.
 * null for anything else, so "Key concepts of …" in a question stays question text.
 */
function keyHeaderRest(line: string): string | null {
  const m = KEY_HEADER.exec(line)
  if (!m) return null
  const rest = (m[1] ?? '').trim()
  return rest === '' || onlyPairs(rest, 1) ? rest : null
}

function questionStart(line: string): { n: number; restText: string } | null {
  const a = QUESTION_START.exec(line)
  if (a) return { n: Number(a[1] ?? a[2]), restText: (a[3] ?? '').trim() }
  const b = QUESTION_START_Q.exec(line)
  if (b) return { n: Number(b[1]), restText: (b[2] ?? '').trim() }
  return null
}

export function parseQuestionLines(rawLines: string[], opts: ParseOptions): ImportResult {
  const warnings: ImportWarning[] = []
  const done: Draft[] = []
  const key = new Map<number, OptionLetter>()
  let cur: Draft | null = null
  let keyMode = false

  const finish = () => {
    if (cur) done.push(cur)
    cur = null
  }
  const addKey = (text: string) => {
    for (const [n, l] of keyPairs(text)) key.set(n, l)
  }
  const setAnswer = (q: Draft, raw: string) => {
    q.rawAnswer = raw
    q.answer = toLetter(raw)
  }

  for (const raw of rawLines) {
    if (raw === IMAGE_MARK) {
      if (cur) (cur as Draft).images++
      continue
    }
    let line = normalizeLine(raw)
    if (!line) continue

    if (keyMode) {
      addKey(line)
      continue
    }

    const headerRest = keyHeaderRest(line)
    if (headerRest !== null) {
      finish()
      keyMode = true
      addKey(headerRest)
      continue
    }
    if (done.length + (cur ? 1 : 0) > 0 && isKeyOnlyLine(line)) {
      finish()
      keyMode = true
      addKey(line)
      continue
    }

    const ans = ANSWER_LINE.exec(line) ?? ANSWER_LINE_BARE.exec(line)
    if (ans) {
      if (cur) setAnswer(cur, ans[1]!)
      continue
    }

    // "D. 7   Answer: B" — take the answer off the end first.
    let trailingAnswer: string | null = null
    const suffix = ANSWER_SUFFIX.exec(line)
    if (suffix) {
      trailingAnswer = suffix[1]!
      line = line.slice(0, suffix.index).trim()
    }

    const qs = questionStart(line)
    if (qs) {
      const { n, restText } = qs
      const c = cur as Draft | null
      // An answer key without a heading: "1. B" right after the last question, restarting the count.
      if (c && n <= c.number && /^\(?[A-Da-d]\)?\.?$/.test(restText) && c.options.length > 0) {
        finish()
        keyMode = true
        addKey(line)
        continue
      }
      // "1. Heat it" inside a question's text (before its options) is a sub-list, not a new question.
      if (!c || c.options.length > 0 || n === c.number + 1 || c.body.length === 0) {
        finish()
        const q: Draft = { number: n, body: [], options: [], answer: null, rawAnswer: null, images: 0, outOfOrder: false }
        const inline = findInlineOptionsInText(restText)
        if (inline) {
          q.body.push(inline.before)
          q.options.push(...inline.options)
        } else if (restText) q.body.push(restText)
        if (trailingAnswer) setAnswer(q, trailingAnswer)
        cur = q
        if (done.length + 1 > MAX_IMPORTED_QUESTIONS)
          throw new ImportError('exams.upload.errors.tooManyQuestions', { max: MAX_IMPORTED_QUESTIONS })
        continue
      }
    }

    const om = OPTION_START.exec(line)
    if (om && cur) {
      const q = cur as Draft
      const letter = (om[1] ?? om[2])!.toUpperCase()
      const style: Style = om[1] ? '()' : (om[3] as '.' | ')')
      const idx = letter.charCodeAt(0) - 65
      if (idx !== q.options.length) q.outOfOrder = true
      const split = splitInlineOptions(line, style, idx)
      if (split && split.before === '') q.options.push(...split.options)
      else q.options.push((om[4] ?? '').trim())
      if (trailingAnswer) setAnswer(q, trailingAnswer)
      continue
    }

    // Plain text: before options it continues the question; after, it continues the last
    // option (a long option wrapped onto the next line). Text before question 1 is a title.
    if (cur) {
      const q = cur as Draft
      if (q.options.length === 0) q.body.push(line)
      else q.options[q.options.length - 1] = `${q.options[q.options.length - 1]} ${line}`.trim()
      if (trailingAnswer) setAnswer(q, trailingAnswer)
    }
  }
  finish()

  if (done.length === 0) throw new ImportError('exams.upload.errors.noQuestionsFound')

  // Answer key: fills missing answers; an Answer line wins if they disagree.
  const numbers = new Set(done.map((q) => q.number))
  for (const q of done) {
    const k = key.get(q.number)
    if (!k) continue
    if (!q.answer && !q.rawAnswer) q.answer = k
    else if (q.answer && q.answer !== k)
      warnings.push({ key: 'exams.upload.warnings.keyConflict', values: { number: q.number, line: q.answer, key: k } })
  }
  const unknown = [...key.keys()].filter((n) => !numbers.has(n)).sort((a, b) => a - b)
  if (unknown.length) warnings.push({ key: 'exams.upload.warnings.keyUnknown', values: { numbers: unknown.join(', ') } })

  for (const q of done) {
    if (q.rawAnswer && !q.answer)
      warnings.push({ key: 'exams.upload.warnings.badAnswerQ', values: { number: q.number, value: q.rawAnswer } })
    if (q.outOfOrder) warnings.push({ key: 'exams.upload.warnings.optionOrder', values: { number: q.number } })
  }
  const withImages = done.filter((q) => q.images > 0).map((q) => q.number)
  if (withImages.length)
    warnings.push({ key: 'exams.upload.warnings.imagesSkipped', values: { numbers: withImages.join(', '), count: withImages.length } })

  const questions: DraftQuestion[] = done.map((q) => ({
    key: newQuestionKey(),
    number: q.number,
    body: q.body.join(opts.joinBody).trim(),
    options: q.options,
    correct: q.answer,
    points: 1,
    image_url: null,
  }))
  return { questions, warnings }
}
