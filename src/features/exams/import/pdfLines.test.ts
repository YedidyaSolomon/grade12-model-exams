import { describe, expect, it } from 'vitest'
import { itemsToLines, pageLines, type PdfTextItem } from './pdfLines'
import { parseQuestionLines } from './textParser'

/** Text runs the way pdfjs reports them: x from the left, y from the bottom of the page. */
const run = (str: string, x: number, y: number, h = 11): PdfTextItem => ({ str, x, y, width: str.length * h * 0.5, height: h })

describe('itemsToLines', () => {
  it('orders runs top to bottom, left to right, and adds spaces only at real gaps', () => {
    const lines = itemsToLines([
      run('B. 5', 300, 700),
      run('1. What is 2 + 3?', 50, 720),
      run('A. 4', 50, 700),
      run('Pho', 50, 680),
      run('to', 50 + 3 * 5.5, 680), // touches "Pho": same word
      run('synthesis', 50 + 5 * 5.5 + 4, 680), // small visible gap: a space
    ])
    expect(lines.map((l) => l.text)).toEqual(['1. What is 2 + 3?', 'A. 4 B. 5', 'Photo synthesis'])
  })

  it('keeps superscripts and subscripts on their line', () => {
    // "+ H" is 16.5 wide (ends at 80.5); the subscript 2 touches it, then "O" touches the 2.
    const lines = itemsToLines([run('x', 50, 700), run('2', 56, 704, 7), run('+ H', 64, 700), run('2', 80.5, 697, 7), run('O', 84, 700)])
    expect(lines).toHaveLength(1)
    expect(lines[0]!.text).toBe('x2 + H2O')
  })
})

describe('pageLines', () => {
  it('drops a page number at the bottom of the page', () => {
    const r = pageLines([run('1. Question?', 50, 700), run('A. a  B. b  C. c  D. d', 50, 680), run('Page 1 of 3', 280, 40)], 595)
    expect(r.lines).toEqual(['1. Question?', 'A. a B. b C. c D. d'])
    expect(r.twoColumns).toBe(false)
  })

  it('does not mistake options on tab stops for a second column', () => {
    const items: PdfTextItem[] = []
    for (let i = 0; i < 6; i++) {
      const y = 780 - i * 40
      items.push(run(`${i + 1}. Question number ${i + 1}?`, 50, y))
      items.push(run('A. one', 60, y - 15), run('B. two', 190, y - 15), run('C. three', 320, y - 15), run('D. four', 450, y - 15))
    }
    expect(pageLines(items, 595).twoColumns).toBe(false)
  })

  it('flags a two-column page', () => {
    const items: PdfTextItem[] = []
    for (let i = 0; i < 8; i++) {
      items.push(run(`Left column text line ${i}`, 40, 780 - i * 15))
      items.push(run(`Right column text line ${i}`, 310, 780 - i * 15))
    }
    expect(pageLines(items, 595).twoColumns).toBe(true)
  })

  it('end to end: positioned runs → lines → questions (options on one line, key at the end)', () => {
    const items = [
      run('Grade 12 Chemistry', 220, 800),
      run('1. Which gas turns limewater', 50, 760),
      run('milky?', 50, 746),
      run('A. O', 60, 730),
      run('2', 72, 727, 7),
      run('B. CO', 190, 730),
      run('2', 213, 727, 7),
      run('C. N', 320, 730),
      run('2', 334, 727, 7),
      run('D. H', 450, 730),
      run('2', 464, 727, 7),
      run('2. pH of pure water at 25 °C?', 50, 700),
      run('A. 0', 60, 684),
      run('B. 1', 190, 684),
      run('C. 7', 320, 684),
      run('D. 14', 450, 684),
      run('Answer key: 1-B, 2-C', 50, 650),
      run('2', 290, 40),
    ]
    const { lines } = pageLines(items, 595)
    const r = parseQuestionLines(lines, { joinBody: ' ' })
    expect(r.questions.map((q) => [q.number, q.body, q.options, q.correct])).toEqual([
      [1, 'Which gas turns limewater milky?', ['O2', 'CO2', 'N2', 'H2'], 'B'],
      [2, 'pH of pure water at 25 °C?', ['0', '1', '7', '14'], 'C'],
    ])
  })
})
