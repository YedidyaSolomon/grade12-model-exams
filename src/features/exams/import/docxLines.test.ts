import { describe, expect, it } from 'vitest'
import { IMAGE_MARK } from './common'
import { mammothToParagraphs, paragraphsToLines, type DocPara } from './docxLines'
import { parseQuestionLines } from './textParser'

const p = (text: string, list: DocPara['list'] = null, images = 0): DocPara => ({ text, list, images })

describe('paragraphsToLines (Word automatic numbering)', () => {
  it('keeps typed numbers and letters as they are', () => {
    expect(paragraphsToLines([p('1. Q?'), p('A. a'), p('B. b')])).toEqual(['1. Q?', 'A. a', 'B. b'])
  })

  it('restores auto-numbered questions with auto-lettered nested options', () => {
    const q = { id: 1, level: 0 }
    const o = { id: 2, level: 1 }
    const lines = paragraphsToLines([
      p('Which is a metal?', q),
      p('Iron', o),
      p('Oxygen', o),
      p('Sulfur', o),
      p('Neon', o),
      p('Answer: A'),
      p('Which is a gas?', q),
      p('Iron', o),
      p('Oxygen', o),
      p('Copper', o),
      p('Zinc', o),
      p('Answer: B'),
    ])
    expect(lines).toEqual([
      '1. Which is a metal?', 'A. Iron', 'B. Oxygen', 'C. Sulfur', 'D. Neon', 'Answer: A',
      '2. Which is a gas?', 'A. Iron', 'B. Oxygen', 'C. Copper', 'D. Zinc', 'Answer: B',
    ])
  })

  it('treats a top-level list in runs of four as options, numbering typed questions on', () => {
    const o = { id: 7, level: 0 }
    const lines = paragraphsToLines([
      p('1. First question'),
      p('a', o), p('b', o), p('c', o), p('d', o),
      p('2. Second question'),
      p('e', o), p('f', o), p('g', o), p('h', o),
    ])
    expect(lines).toEqual(['1. First question', 'A. a', 'B. b', 'C. c', 'D. d', '2. Second question', 'A. e', 'B. f', 'C. g', 'D. h'])
  })

  it('treats auto-numbered items with options on the same line as questions', () => {
    const q = { id: 3, level: 0 }
    const lines = paragraphsToLines([p('2 + 2 = ? A. 3 B. 4 C. 5 D. 6', q), p('3 + 3 = ? A. 5 B. 6 C. 7 D. 8', q)])
    expect(lines).toEqual(['1. 2 + 2 = ? A. 3 B. 4 C. 5 D. 6', '2. 3 + 3 = ? A. 5 B. 6 C. 7 D. 8'])
  })

  it('splits line breaks inside a paragraph and marks pictures', () => {
    expect(paragraphsToLines([p('1. Look at the diagram\nthen answer.', null, 1)])).toEqual([
      '1. Look at the diagram',
      'then answer.',
      IMAGE_MARK,
    ])
  })
})

describe('mammothToParagraphs', () => {
  const t = (value: string) => ({ type: 'run', children: [{ type: 'text', value }] })

  it('flattens paragraphs, lists, line breaks, images and table rows', () => {
    const qList = { isOrdered: true, level: '0' }
    const optList = { isOrdered: true, level: '1' }
    const doc = {
      type: 'document',
      children: [
        { type: 'paragraph', numbering: qList, children: [t('Capital of Ethiopia?')] },
        { type: 'paragraph', numbering: optList, children: [t('Addis Ababa')] },
        { type: 'paragraph', numbering: optList, children: [t('Gondar')] },
        {
          type: 'paragraph',
          numbering: null,
          children: [t('Answer:'), { type: 'run', children: [{ type: 'tab' }] }, t('A'), { type: 'run', children: [{ type: 'image' }] }],
        },
        { type: 'paragraph', numbering: { isOrdered: false, level: '0' }, children: [t('a bullet')] },
        {
          type: 'table',
          children: [
            {
              type: 'tableRow',
              children: [
                { type: 'tableCell', children: [{ type: 'paragraph', children: [t('1')] }] },
                { type: 'tableCell', children: [{ type: 'paragraph', children: [t('A')] }] },
              ],
            },
          ],
        },
      ],
    }
    expect(mammothToParagraphs(doc)).toEqual([
      { text: 'Capital of Ethiopia?', list: { id: 1, level: 0 }, images: 0 },
      { text: 'Addis Ababa', list: { id: 2, level: 1 }, images: 0 },
      { text: 'Gondar', list: { id: 2, level: 1 }, images: 0 },
      { text: 'Answer: A', list: null, images: 1 },
      { text: 'a bullet', list: null, images: 0 },
      { text: '1   A ', list: null, images: 0 },
    ])
  })

  it('end to end: an answer-key table at the end of a Word file', () => {
    const doc = {
      type: 'document',
      children: [
        { type: 'paragraph', children: [t('1. Q one')] },
        { type: 'paragraph', children: [t('A. a    B. b    C. c    D. d')] },
        { type: 'paragraph', children: [t('Answer key')] },
        {
          type: 'table',
          children: [['1', 'D']].map(([n, l]) => ({
            type: 'tableRow',
            children: [n, l].map((v) => ({ type: 'tableCell', children: [{ type: 'paragraph', children: [t(v!)] }] })),
          })),
        },
      ],
    }
    const r = parseQuestionLines(paragraphsToLines(mammothToParagraphs(doc)), { joinBody: '\n' })
    expect(r.questions.map((q) => [q.number, q.options, q.correct])).toEqual([[1, ['a', 'b', 'c', 'd'], 'D']])
  })
})
