import { newQuestionKey, OPTION_LETTERS, type DraftQuestion, type OptionLetter } from './types'
import { ImportError, MAX_IMPORTED_QUESTIONS, type ImportResult, type ImportWarning } from './import/common'

export { ImportError, type ImportResult, type ImportWarning } from './import/common'

/**
 * Question import from Excel (.xlsx), CSV, Word (.docx) or a typed PDF. Text only: images
 * are attached afterwards in the preview. Parsing never "fixes" bad data: an unreadable
 * answer or points value comes through empty / NaN so the normal preview checks
 * (validation.ts) flag it for the admin. The server re-validates everything on save.
 *
 * The Word and PDF readers (mammoth, pdfjs) are separate chunks, loaded only from the
 * admin Import tab.
 */

export const MAX_FILE_BYTES = 2 * 1024 * 1024
export const MAX_PDF_BYTES = 10 * 1024 * 1024
const MAX_ROWS = MAX_IMPORTED_QUESTIONS

export type ImportKind = 'xlsx' | 'csv' | 'docx' | 'pdf'

export const IMPORT_ACCEPT = [
  '.xlsx',
  '.csv',
  '.docx',
  '.pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/pdf',
].join(',')

/** Content type to store the original under (Windows often reports CSV as Excel, or nothing). */
export const IMPORT_CONTENT_TYPE: Record<ImportKind, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
}

export function importKind(fileName: string): ImportKind | null {
  const ext = /\.([a-z0-9]+)$/i.exec(fileName)?.[1]?.toLowerCase()
  return ext === 'xlsx' || ext === 'csv' || ext === 'docx' || ext === 'pdf' ? ext : null
}

const loadDocx = () => import('./import/docx')
const loadPdf = () => import('./import/pdf')

/** Start downloading the Word and PDF readers (called when the Import tab opens). */
export function preloadImporters(): void {
  void loadDocx().catch(() => {})
  void loadPdf().catch(() => {})
}

export async function readQuestionFile(file: File): Promise<ImportResult> {
  const kind = importKind(file.name)
  if (!kind) {
    const old = /\.(xls|doc)$/i.exec(file.name)?.[1]?.toLowerCase()
    throw new ImportError(old === 'doc' ? 'exams.upload.errors.oldDoc' : old === 'xls' ? 'exams.upload.errors.oldXls' : 'exams.upload.errors.type')
  }
  const max = kind === 'pdf' ? MAX_PDF_BYTES : MAX_FILE_BYTES
  if (file.size > max) throw new ImportError('exams.upload.errors.tooBig', { mb: max / 1024 / 1024 })
  if (file.size === 0) throw new ImportError('exams.upload.errors.empty')

  switch (kind) {
    case 'csv':
      return rowsToQuestions(parseCsv(await file.text()))
    case 'xlsx': {
      // Loaded only when an admin actually imports a spreadsheet.
      const { default: readXlsxFile } = await import('read-excel-file')
      let rows: Cell[][]
      try {
        rows = await readXlsxFile(file)
      } catch {
        throw new ImportError('exams.upload.errors.unreadable')
      }
      return rowsToQuestions(rows)
    }
    case 'docx':
      return (await loadDocx()).readDocx(file)
    case 'pdf':
      return (await loadPdf()).readPdf(file)
  }
}

/** A spreadsheet cell as read from CSV (string) or Excel (string, number, boolean, Date, null). */
type Cell = unknown

// --------------------------------------------------------------------------- CSV

/** RFC 4180 CSV: quoted fields, "" escapes, newlines inside quotes, ; or , separator. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '')
  const nl = src.search(/\r?\n/)
  const firstLine = nl < 0 ? src : src.slice(0, nl)
  // Excel in many locales saves CSV with ';'. Pick whichever appears more in the header.
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ','

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += c
    } else if (c === '"' && field === '') quoted = true
    else if (c === sep) {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

// --------------------------------------------------------------------------- rows → questions

type Columns = { number: number | null; question: number; options: number[]; answer: number; points: number | null }

const HEADER_ALIASES: Record<'number' | 'question' | 'answer' | 'points', string[]> = {
  number: ['#', 'no', 'no.', 'number', 'num', 'q#', 'q no', 'question number'],
  question: ['question', 'questions', 'question text', 'stem'],
  answer: ['answer', 'correct', 'correct answer', 'key', 'answer key'],
  points: ['points', 'point', 'marks', 'mark', 'score'],
}

function text(c: Cell): string {
  if (c == null) return ''
  if (c instanceof Date) return c.toISOString()
  return String(c).trim()
}

function norm(c: Cell): string {
  return text(c).toLowerCase().replace(/\s+/g, ' ')
}

/** "A", "option a", "choice a", "(a)", "a)" → index 0..5 (A–F), else -1. */
function optionHeaderIndex(h: string): number {
  const m = /^(?:option|choice)?\s*\(?([a-f])\)?\.?$/.exec(h)
  return m?.[1] ? m[1].charCodeAt(0) - 97 : -1
}

function detectHeader(row: Cell[]): Columns | null {
  const h = row.map(norm)
  const find = (k: keyof typeof HEADER_ALIASES) => h.findIndex((x) => HEADER_ALIASES[k].includes(x))
  const question = find('question')
  const answer = find('answer')
  const opts: [number, number][] = []
  h.forEach((x, col) => {
    const i = optionHeaderIndex(x)
    if (i >= 0) opts.push([i, col])
  })
  if (question < 0 || answer < 0 || opts.length < 2) return null
  opts.sort((a, b) => a[0] - b[0])
  const number = find('number')
  const points = find('points')
  return {
    number: number >= 0 ? number : null,
    question,
    options: opts.map(([, col]) => col),
    answer,
    points: points >= 0 ? points : null,
  }
}

/** No header row: # | Question | A | B | C | D | Answer | Points (# optional). */
function positionalColumns(row: Cell[]): Columns {
  const hasNumber = /^\d+$/.test(text(row[0]))
  const o = hasNumber ? 1 : 0
  return { number: hasNumber ? 0 : null, question: o, options: [o + 1, o + 2, o + 3, o + 4], answer: o + 5, points: o + 6 }
}

/** "B", "b", "(B)", "B)", "B." or 1–4 → letter; anything else → null (flagged later). */
function parseAnswer(raw: string, optionCount: number): OptionLetter | null {
  const s = raw.trim().replace(/^\(|[).]$/g, '').trim().toUpperCase()
  const idx = /^[A-F]$/.test(s) ? s.charCodeAt(0) - 65 : /^[1-6]$/.test(s) ? Number(s) - 1 : -1
  if (idx < 0 || idx >= Math.min(optionCount, OPTION_LETTERS.length)) return null
  return OPTION_LETTERS[idx] ?? null
}

export function rowsToQuestions(allRows: Cell[][]): ImportResult {
  const rows = allRows.filter((r) => r.some((c) => text(c) !== ''))
  const [first] = rows
  if (!first) throw new ImportError('exams.upload.errors.empty')
  if (rows.length > MAX_ROWS) throw new ImportError('exams.upload.errors.tooManyRows', { max: MAX_ROWS })

  const header = detectHeader(first)
  const cols = header ?? positionalColumns(first)
  const body = header ? rows.slice(1) : rows
  if (body.length === 0) throw new ImportError('exams.upload.errors.empty')

  const warnings: ImportWarning[] = []
  if (!header) warnings.push({ key: 'exams.upload.warnings.noHeader' })

  const questions = body.map((r, i): DraftQuestion => {
    // Spreadsheet row number as the admin sees it (1-based, header counted).
    const sheetRow = allRows.indexOf(r) + 1
    const options = cols.options.map((c) => text(r[c]))
    // Drop trailing empty option columns beyond D (an empty "E" column is not a 5th option).
    while (options.length > 4 && options[options.length - 1] === '') options.pop()

    const rawAnswer = text(r[cols.answer])
    const correct = parseAnswer(rawAnswer, options.length)
    if (rawAnswer && !correct) warnings.push({ key: 'exams.upload.warnings.badAnswer', values: { row: sheetRow, value: rawAnswer } })

    const rawPoints = cols.points == null ? '' : text(r[cols.points])
    const points = rawPoints === '' ? 1 : Number(rawPoints)
    if (rawPoints !== '' && !(Number.isInteger(points) && points >= 1 && points <= 100))
      warnings.push({ key: 'exams.upload.warnings.badPoints', values: { row: sheetRow, value: rawPoints } })

    const rawNumber = cols.number == null ? '' : text(r[cols.number])
    const number = /^\d+$/.test(rawNumber) ? Number(rawNumber) : i + 1

    return { key: newQuestionKey(), number, body: text(r[cols.question]), options, correct, points, image_url: null }
  })

  return { questions, warnings }
}

// --------------------------------------------------------------------------- template

const TEMPLATE_ROWS = [
  ['#', 'Question', 'A', 'B', 'C', 'D', 'Answer', 'Points'],
  ['1', 'What is 2 + 3?', '4', '5', '6', '7', 'B', '1'],
  ['2', 'Which gas do plants take in for photosynthesis?', 'Oxygen', 'Nitrogen', 'Carbon dioxide', 'Hydrogen', 'C', '1'],
]

/** CSV template with a UTF-8 BOM so Excel shows Amharic text correctly. */
export function templateCsv(): string {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  return '﻿' + TEMPLATE_ROWS.map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n'
}
