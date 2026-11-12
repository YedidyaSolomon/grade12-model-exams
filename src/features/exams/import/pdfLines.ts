import { ImportError, type ImportResult, type ImportWarning } from './common'
import { parseQuestionLines } from './textParser'

/**
 * Rebuilding reading-order lines from PDF text positions. No pdfjs import here: the
 * document is passed in, so tests can use pdfjs's Node build and real PDF files.
 * PDF text has no lines or paragraphs, only positioned runs of text.
 */

/** One run of text as pdfjs reports it (x, y = baseline origin in PDF points, y grows upward). */
export type PdfTextItem = { str: string; x: number; y: number; width: number; height: number }

/** `segments`: the line split at wide gaps (tab stops, or two columns side by side). */
export type PdfLine = { text: string; x: number; y: number; segments: { x: number; text: string }[] }

/** Fewer characters than this on a page = probably a scanned image, not typed text. */
export const SCANNED_PAGE_CHARS = 20

export function itemsToLines(items: PdfTextItem[]): PdfLine[] {
  const runs = items.filter((i) => i.str.trim() !== '')
  if (runs.length === 0) return []

  const heights = runs.map((i) => i.height).filter((h) => h > 0).sort((a, b) => a - b)
  const typical = heights[Math.floor(heights.length / 2)] ?? 10
  // Same line if baselines are within half a line height (keeps x² and H₂O on their line).
  const tolerance = Math.max(2, typical * 0.5)

  const sorted = [...runs].sort((a, b) => b.y - a.y || a.x - b.x)
  const groups: PdfTextItem[][] = []
  // Each line is anchored on its tallest run (normal text), not on a raised superscript
  // that happens to come first in top-to-bottom order.
  let anchor: PdfTextItem | null = null
  for (const item of sorted) {
    const g = groups[groups.length - 1]
    const tol = anchor ? Math.max(tolerance, Math.max(anchor.height, item.height) * 0.5) : tolerance
    if (g && anchor && Math.abs(anchor.y - item.y) <= tol) {
      g.push(item)
      if (item.height > anchor.height) anchor = item
    } else {
      groups.push([item])
      anchor = item
    }
  }

  return groups.map((g) => {
    g.sort((a, b) => a.x - b.x)
    let text = ''
    let end = -Infinity
    const segments: { x: number; text: string }[] = []
    for (const item of g) {
      const h = item.height || typical
      const gap = item.x - end
      // A visible gap between runs is a space; runs that touch are one word.
      if (text !== '' && gap > h * 0.15) text += ' '
      if (segments.length === 0 || gap > h * 2) segments.push({ x: item.x, text: '' })
      const seg = segments[segments.length - 1]!
      seg.text = `${seg.text}${seg.text && gap > h * 0.15 ? ' ' : ''}${item.str}`
      text += item.str
      end = Math.max(end, item.x + item.width)
    }
    return {
      text: text.replace(/\s+/g, ' ').trim(),
      x: g[0]!.x,
      y: g[0]!.y,
      segments: segments.map((s) => ({ x: s.x, text: s.text.replace(/\s+/g, ' ').trim() })),
    }
  })
}

/** "Page 3", "Page 3 of 10", "- 3 -" or a bare "3" at the top or bottom of a page. */
export function isPageNumberLine(text: string): boolean {
  return /^(?:page\s*)?[-–]?\s*\d{1,4}\s*[-–]?(?:\s*(?:of|\/)\s*\d{1,4})?$/i.test(text.trim())
}

const OPTION_MARKER = /^\(?[A-Da-d][.)]/

/**
 * Lines of one page, without a page number at the top or bottom.
 * `twoColumns`: the page looks like it has two columns of text. Lines from both columns
 * are then mixed together, so the questions will need checking.
 */
export function pageLines(items: PdfTextItem[], pageWidth: number): { lines: string[]; twoColumns: boolean; chars: number } {
  const chars = items.reduce((n, i) => n + i.str.trim().length, 0)
  const lines = itemsToLines(items)
  if (lines.length && isPageNumberLine(lines[0]!.text)) lines.shift()
  if (lines.length && isPageNumberLine(lines[lines.length - 1]!.text)) lines.pop()

  // Second column: text that starts near the middle of the page after a wide gap (or a
  // line that starts there), and isn't an option on a tab stop ("C. …").
  const mid = (x: number) => x > pageWidth * 0.4 && x < pageWidth * 0.62
  const rightColumnLines = lines.filter((l) =>
    l.segments.some((s, i) => (i > 0 || l.segments.length === 1) && mid(s.x) && !OPTION_MARKER.test(s.text)),
  ).length
  const leftStarts = lines.filter((l) => l.x < pageWidth * 0.3).length
  const twoColumns = lines.length >= 6 && leftStarts > 0 && rightColumnLines >= Math.max(3, lines.length * 0.3)
  return { lines: lines.map((l) => l.text), twoColumns, chars }
}

/** The parts of a pdfjs PDFDocumentProxy we use. */
export type PdfDocLike = {
  numPages: number
  getPage(n: number): Promise<{
    getViewport(o: { scale: number }): { width: number }
    getTextContent(): Promise<{ items: unknown[] }>
    cleanup(): unknown
  }>
}

type RawTextItem = { str: string; transform: number[]; width: number; height: number }

function isTextItem(i: unknown): i is RawTextItem {
  return typeof i === 'object' && i !== null && 'str' in i && 'transform' in i
}

/** Reads every page, then parses the questions. Typed PDFs only (no OCR). */
export async function readPdfPages(doc: PdfDocLike): Promise<ImportResult> {
  const lines: string[] = []
  const emptyPages: number[] = []
  const twoColumnPages: number[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const { width } = page.getViewport({ scale: 1 })
    const content = await page.getTextContent()
    const items: PdfTextItem[] = content.items.filter(isTextItem).map((i) => ({
      str: i.str,
      x: Number(i.transform[4]),
      y: Number(i.transform[5]),
      width: i.width,
      height: i.height || Math.abs(Number(i.transform[3])),
    }))
    const r = pageLines(items, width)
    if (r.chars < SCANNED_PAGE_CHARS) emptyPages.push(p)
    if (r.twoColumns) twoColumnPages.push(p)
    lines.push(...r.lines)
    page.cleanup()
  }

  // Every page (nearly) empty: a scanned paper. Typed text is needed.
  if (emptyPages.length === doc.numPages) throw new ImportError('exams.upload.errors.scanned')

  const warnings: ImportWarning[] = []
  if (emptyPages.length)
    warnings.push({ key: 'exams.upload.warnings.scannedPages', values: { pages: emptyPages.join(', '), count: emptyPages.length } })
  if (twoColumnPages.length)
    warnings.push({ key: 'exams.upload.warnings.twoColumns', values: { pages: twoColumnPages.join(', '), count: twoColumnPages.length } })

  const result = parseQuestionLines(lines, { joinBody: ' ' })
  return { questions: result.questions, warnings: [...warnings, ...result.warnings] }
}
