import { IMAGE_MARK } from './common'

/**
 * Word document → text lines for the question parser (pure, unit-tested).
 *
 * Word's automatic numbering ("1." / "A." added by a list style) isn't in the paragraph
 * text, so it is put back here. mammoth tells us which paragraphs belong to the same list
 * (same numbering-level object) and the list level, but not whether the list counts
 * 1, 2, 3 or A, B, C. So:
 *   - nested list items (level 1+) are options: A, B, C… restarting for each group;
 *   - a top-level list whose items come in runs of 2–6 (between other paragraphs) is an
 *     option list; one whose items come one at a time is the question list, counted on
 *     from the last question number.
 * Anything still wrong shows up as a flagged question in the preview.
 */

export type DocPara = {
  text: string
  /** `id`: same id = same Word list. null = not in a list (or a bullet list). */
  list: { id: number; level: number } | null
  images: number
}

const HAS_QUESTION_NUMBER = /^(?:(?:q|question)\s*\.?\s*)?(?:\(\d{1,3}\)|\d{1,3}\s*[.):])(?=\s|$)/i
const HAS_OPTION_MARKER = /^(?:\([A-Da-d]\)|[A-Da-d]\s*[.)])(?=\s|$)/

function listKey(p: DocPara): string | null {
  return p.list ? `${p.list.id}:${p.list.level}` : null
}

/** Decide, per list, whether it numbers questions or letters options. */
function classifyLists(paras: DocPara[]): Map<string, 'numbers' | 'letters'> {
  const runs = new Map<string, number[]>()
  const questionish = new Map<string, number>()
  let prev: string | null = null
  for (const p of paras) {
    const k = listKey(p)
    if (k) {
      const r = runs.get(k) ?? []
      if (k === prev) r[r.length - 1]!++
      else r.push(1)
      runs.set(k, r)
      // Long items, items ending in "?", or items with options on the same line are questions.
      if (p.text.length > 90 || /\?\s*$/.test(p.text) || /\s\(?[Bb][.)]\s/.test(p.text))
        questionish.set(k, (questionish.get(k) ?? 0) + 1)
    }
    if (p.text.trim() !== '' || p.images > 0) prev = k
  }
  const kinds = new Map<string, 'numbers' | 'letters'>()
  for (const [k, r] of runs) {
    const level = Number(k.split(':')[1])
    const total = r.reduce((a, b) => a + b, 0)
    const avg = total / r.length
    const max = Math.max(...r)
    const mostlyQuestions = (questionish.get(k) ?? 0) > total / 2
    kinds.set(k, level >= 1 || (!mostlyQuestions && avg >= 1.8 && max <= 6) ? 'letters' : 'numbers')
  }
  return kinds
}

export function paragraphsToLines(paras: DocPara[]): string[] {
  const kinds = classifyLists(paras)
  const lines: string[] = []
  let lastQuestion = 0
  let prevKey: string | null = null
  let letterIndex = 0

  for (const p of paras) {
    const k = listKey(p)
    const parts = p.text.split('\n')
    let first = parts[0] ?? ''

    if (k && first.trim() !== '') {
      const kind = kinds.get(k)
      if (kind === 'letters') {
        letterIndex = k === prevKey ? letterIndex + 1 : 0
        if (!HAS_OPTION_MARKER.test(first.trim())) first = `${'ABCDEF'[Math.min(letterIndex, 5)]}. ${first}`
      } else if (!HAS_QUESTION_NUMBER.test(first.trim())) {
        first = `${lastQuestion + 1}. ${first}`
      }
    }
    const m = /^(?:(?:q|question)\s*\.?\s*)?\(?(\d{1,3})\s*[.):]/i.exec(first.trim())
    if (m && (!k || kinds.get(k) !== 'letters')) lastQuestion = Number(m[1])

    lines.push(first, ...parts.slice(1))
    for (let i = 0; i < p.images; i++) lines.push(IMAGE_MARK)
    if (p.text.trim() !== '' || p.images > 0) prevKey = k
  }
  return lines
}

// --------------------------------------------------------------------------- mammoth tree

/** The parts of mammoth's document model we read (see mammoth/lib/documents.js). */
type MammothNode = {
  type: string
  value?: string
  breakType?: string
  children?: MammothNode[]
  numbering?: { level?: string | number; isOrdered?: boolean } | null
}

/**
 * Flattens mammoth's document into paragraphs. A table row becomes one paragraph (so an
 * answer key laid out as a table, "1 | B", still reads as "1 B").
 */
export function mammothToParagraphs(doc: MammothNode): DocPara[] {
  const listIds = new Map<object, number>()
  const out: DocPara[] = []

  const collect = (n: MammothNode, acc: { text: string; images: number }) => {
    switch (n.type) {
      case 'text':
        acc.text += n.value ?? ''
        return
      case 'tab':
        acc.text += ' '
        return
      case 'break':
        acc.text += n.breakType === 'line' || !n.breakType ? '\n' : ' '
        return
      case 'image':
        acc.images++
        return
      case 'paragraph':
        // Only reached inside table cells: keep the cell's paragraphs apart.
        for (const c of n.children ?? []) collect(c, acc)
        acc.text += ' '
        return
      default:
        for (const c of n.children ?? []) collect(c, acc)
    }
  }

  const walk = (n: MammothNode) => {
    if (n.type === 'paragraph') {
      const acc = { text: '', images: 0 }
      for (const c of n.children ?? []) collect(c, acc)
      let list: DocPara['list'] = null
      if (n.numbering && n.numbering.isOrdered !== false) {
        let id = listIds.get(n.numbering)
        if (id === undefined) {
          id = listIds.size + 1
          listIds.set(n.numbering, id)
        }
        list = { id, level: Number(n.numbering.level ?? 0) }
      }
      out.push({ text: acc.text, list, images: acc.images })
    } else if (n.type === 'tableRow') {
      const acc = { text: '', images: 0 }
      for (const cell of n.children ?? []) {
        const cellAcc = { text: '', images: 0 }
        collect(cell, cellAcc)
        acc.text += (acc.text ? '  ' : '') + cellAcc.text.replace(/\n/g, ' ')
        acc.images += cellAcc.images
      }
      out.push({ text: acc.text, list: null, images: acc.images })
    } else {
      for (const c of n.children ?? []) walk(c)
    }
  }
  walk(doc)
  return out
}
