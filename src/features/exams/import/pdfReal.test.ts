/**
 * Real PDFs through real pdfjs (its Node build), using the same readPdfPages as the app.
 * Fixtures are printed from the HTML files in __fixtures__ with headless Chrome:
 *   chrome --headless=new --no-pdf-header-footer --print-to-pdf=typed.pdf typed.html
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { ImportError } from './common'
import { readPdfPages } from './pdfLines'

async function readFixture(name: string) {
  const data = new Uint8Array(readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url))))
  const task = getDocument({ data })
  try {
    return await readPdfPages(await task.promise)
  } finally {
    void task.destroy()
  }
}

describe('real PDF files', () => {
  it('typed paper: wrapped lines, subscripts, options on one line / two per line, page break, key at the end', async () => {
    const r = await readFixture('typed.pdf')
    expect(r.questions.map((q) => [q.number, q.body, q.options, q.correct])).toEqual([
      [1, 'Which gas turns limewater milky when it is bubbled through the solution for a few minutes?', ['O2', 'CO2', 'N2', 'H2'], 'B'],
      [2, 'What is the pH of pure water at 25 °C?', ['0', '1', '7', '14'], 'C'],
      [
        3,
        'Which statement about catalysts is correct?',
        ['They are used up', 'They raise ΔH', 'They lower the activation energy', 'They shift equilibrium'],
        'C',
      ],
      [
        4,
        'Which of the following best explains why ionic compounds conduct electricity when molten but not when solid?',
        [
          'Their ions can move only when the solid is melted or dissolved in water, so charge can flow',
          'Electrons are free in the solid',
          'Molten compounds have no ions',
          'Heat makes new electrons',
        ],
        'A',
      ],
    ])
    expect(r.warnings).toEqual([])
  })

  it('two-column paper: warns about the layout', async () => {
    const r = await readFixture('twocol.pdf')
    expect(r.warnings.map((w) => w.key)).toContain('exams.upload.warnings.twoColumns')
  })

  it('scanned paper (no text layer): refuses with the "looks scanned" message', async () => {
    await expect(readFixture('scanned.pdf')).rejects.toThrow(ImportError)
    await expect(readFixture('scanned.pdf')).rejects.toMatchObject({ key: 'exams.upload.errors.scanned' })
  })
})
