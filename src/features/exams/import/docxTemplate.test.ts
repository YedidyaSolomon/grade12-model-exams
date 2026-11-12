import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import mammoth from 'mammoth'
import { describe, expect, it } from 'vitest'
import { mammothToParagraphs, paragraphsToLines } from './docxLines'
import { parseQuestionLines } from './textParser'

// The real "Download Word template" file, read with mammoth exactly like docx.ts does.
const TEMPLATE = fileURLToPath(new URL('../../../../public/templates/question-template.docx', import.meta.url))

describe('Word template', () => {
  it('imports cleanly: 3 questions, 4 options each, every answer set, no warnings', async () => {
    let doc: Parameters<typeof mammothToParagraphs>[0] | null = null
    const buffer = readFileSync(TEMPLATE)
    await mammoth.convertToHtml(
      { buffer },
      {
        transformDocument: (el: unknown) => {
          doc = el as typeof doc
          return el
        },
      },
    )
    expect(doc).not.toBeNull()
    const r = parseQuestionLines(paragraphsToLines(mammothToParagraphs(doc!)), { joinBody: '\n' })
    expect(r.questions.map((q) => [q.number, q.body, q.options, q.correct])).toEqual([
      [1, 'Which part of the cell produces most of its energy (ATP)?', ['Nucleus', 'Mitochondrion', 'Ribosome', 'Golgi body'], 'B'],
      [2, 'What is the value of 3² + 4²?', ['7', '12', '25', '49'], 'C'],
      [3, 'Which city is the capital of Ethiopia?', ['Addis Ababa', 'Bahir Dar', 'Hawassa', 'Mekelle'], 'A'],
    ])
    expect(r.warnings).toEqual([])
  })
})
