import { describe, expect, it } from 'vitest'
import { IMAGE_MARK, ImportError } from './common'
import { parseQuestionLines, splitInlineOptions } from './textParser'

const word = (text: string) => parseQuestionLines(text.split('\n'), { joinBody: '\n' })
const pdf = (text: string) => parseQuestionLines(text.split('\n'), { joinBody: ' ' })
const simple = (r: ReturnType<typeof word>) =>
  r.questions.map((q) => ({ n: q.number, body: q.body, options: q.options, correct: q.correct }))

describe('Word text: Answer lines', () => {
  it('reads questions, options one per line, and Answer lines', () => {
    const r = word(`Grade 12 Biology Model Exam
Answer all questions.

1. Which organelle makes ATP?
A. Nucleus
B. Mitochondrion
C. Ribosome
D. Golgi body
Answer: B

2. What is 2 + 3?
A) 4
B) 5
C) 6
D) 7
Answer: b`)
    expect(simple(r)).toEqual([
      { n: 1, body: 'Which organelle makes ATP?', options: ['Nucleus', 'Mitochondrion', 'Ribosome', 'Golgi body'], correct: 'B' },
      { n: 2, body: 'What is 2 + 3?', options: ['4', '5', '6', '7'], correct: 'B' },
    ])
    expect(r.warnings).toEqual([])
  })

  it('keeps question text that continues on the next lines', () => {
    const r = word(`1. A car travels 100 km in 2 hours.
What is its average speed?
(A) 25 km/h
(B) 50 km/h
(C) 100 km/h
(D) 200 km/h
Ans: (B)`)
    expect(r.questions[0]!.body).toBe('A car travels 100 km in 2 hours.\nWhat is its average speed?')
    expect(r.questions[0]!.options).toEqual(['25 km/h', '50 km/h', '100 km/h', '200 km/h'])
    expect(r.questions[0]!.correct).toBe('B')
  })

  it('accepts "a." lower-case options and "Q1." numbering', () => {
    const r = word(`Q1. Pick the noble gas.
a. Oxygen
b. Neon
c. Nitrogen
d. Chlorine
Correct answer: b`)
    expect(simple(r)[0]).toEqual({ n: 1, body: 'Pick the noble gas.', options: ['Oxygen', 'Neon', 'Nitrogen', 'Chlorine'], correct: 'B' })
  })

  it('reads all four options on one line, and two per line', () => {
    const r = word(`1. 7 × 8 = ?
A. 54   B. 56   C. 58   D. 64
Answer: B
2. Capital of Ethiopia?
A) Addis Ababa    B) Gondar
C) Hawassa        D) Mekelle
Answer: A`)
    expect(r.questions[0]!.options).toEqual(['54', '56', '58', '64'])
    expect(r.questions[1]!.options).toEqual(['Addis Ababa', 'Gondar', 'Hawassa', 'Mekelle'])
    expect(r.questions.map((q) => q.correct)).toEqual(['B', 'A'])
  })

  it('reads options written on the question line itself', () => {
    const r = word(`1. 2 + 2 = ? A. 3 B. 4 C. 5 D. 6
Answer: B`)
    expect(simple(r)[0]).toEqual({ n: 1, body: '2 + 2 = ?', options: ['3', '4', '5', '6'], correct: 'B' })
  })

  it('takes an answer written at the end of the options line', () => {
    const r = word(`1. Water boils at (sea level):
A. 50 °C  B. 90 °C  C. 100 °C  D. 120 °C   Answer: C`)
    expect(r.questions[0]!.options).toEqual(['50 °C', '90 °C', '100 °C', '120 °C'])
    expect(r.questions[0]!.correct).toBe('C')
  })

  it('does not split "vitamin C." inside an option of another marker style', () => {
    expect(splitInlineOptions('A) Lack of vitamin C. deficiency B) Iron', ')', 0)?.options).toEqual([
      'Lack of vitamin C. deficiency',
      'Iron',
    ])
  })

  it('does not read "2.5 kg" in question text as question 2', () => {
    const r = word(`1. A box has a mass of
2.5 kg. What is its weight?
A. 2.5 N
B. 25 N
C. 250 N
D. 0.25 N
Answer: B`)
    expect(r.questions).toHaveLength(1)
    expect(r.questions[0]!.body).toBe('A box has a mass of\n2.5 kg. What is its weight?')
  })

  it('keeps a numbered sub-list inside the question text', () => {
    const r = word(`5. Put the steps in order:
1. Heat the water
2. Add salt
A. 1 then 2
B. 2 then 1
C. Both together
D. Neither
Answer: A
6. Next question?
A. a
B. b
C. c
D. d
Answer: D`)
    expect(r.questions.map((q) => q.number)).toEqual([5, 6])
    expect(r.questions[0]!.body).toBe('Put the steps in order:\n1. Heat the water\n2. Add salt')
  })

  it('leaves "Key concepts…" in a question as text, not an answer key', () => {
    const r = word(`1. Read the passage.
Key concepts of the passage are listed below.
A. a
B. b
C. c
D. d
Answer: A`)
    expect(r.questions[0]!.body).toBe('Read the passage.\nKey concepts of the passage are listed below.')
    expect(r.questions[0]!.correct).toBe('A')
  })
})

describe('Word text: answer key at the end', () => {
  it('reads "Answer key: 1-B, 2-C, 3.A" on one line', () => {
    const r = word(`1. Q one
A. a
B. b
C. c
D. d
2. Q two
A. a B. b C. c D. d
3. Q three
(A) a (B) b (C) c (D) d

Answer key: 1-B, 2-C, 3.A`)
    expect(r.questions.map((q) => q.correct)).toEqual(['B', 'C', 'A'])
    expect(r.warnings).toEqual([])
  })

  it('reads a key heading followed by one pair per line', () => {
    const r = word(`1. Q one
A. a
B. b
C. c
D. d
2. Q two
A. a
B. b
C. c
D. d
Answers
1. D
2. (a)`)
    expect(r.questions.map((q) => q.correct)).toEqual(['D', 'A'])
  })

  it('reads a key without a heading ("1. B" restarting the count)', () => {
    const r = word(`1. Q one
A. a
B. b
C. c
D. d
2. Q two
A. a
B. b
C. c
D. d
1. C
2. B`)
    expect(r.questions).toHaveLength(2)
    expect(r.questions.map((q) => q.correct)).toEqual(['C', 'B'])
  })

  it('reads a key line of pairs without a heading', () => {
    const r = word(`1. Q one
A. a B. b C. c D. d
2. Q two
A. a B. b C. c D. d
1-A 2-D`)
    expect(r.questions.map((q) => q.correct)).toEqual(['A', 'D'])
  })

  it('warns about key entries for missing questions and about conflicts', () => {
    const r = word(`1. Q one
A. a B. b C. c D. d
Answer: A
2. Q two
A. a B. b C. c D. d
Answer key: 1-B, 2-C, 9-D`)
    expect(r.questions.map((q) => q.correct)).toEqual(['A', 'C'])
    expect(r.warnings.map((w) => w.key)).toEqual([
      'exams.upload.warnings.keyConflict',
      'exams.upload.warnings.keyUnknown',
    ])
    expect(r.warnings[1]!.values).toEqual({ numbers: '9' })
  })
})

describe('problems come through for the preview to flag', () => {
  it('missing answers, wrong option counts, empty questions and gaps are kept as-is', () => {
    const r = word(`1. Has no answer
A. a
B. b
C. c
D. d
2. Only three options
A. a
B. b
C. c
Answer: A
3.
A. a
B. b
C. c
D. d
Answer: C
5. After a gap
A. a
B. b
C. c
D. d
Answer: E`)
    expect(r.questions.map((q) => q.number)).toEqual([1, 2, 3, 5])
    expect(r.questions[0]!.correct).toBeNull()
    expect(r.questions[1]!.options).toHaveLength(3)
    expect(r.questions[2]!.body).toBe('')
    expect(r.questions[3]!.correct).toBeNull()
    expect(r.warnings).toContainEqual({ key: 'exams.upload.warnings.badAnswerQ', values: { number: 5, value: 'E' } })
  })

  it('warns when options are out of order', () => {
    const r = word(`1. Q
A. a
C. c
B. b
D. d
Answer: A`)
    expect(r.warnings).toContainEqual({ key: 'exams.upload.warnings.optionOrder', values: { number: 1 } })
  })

  it('lists the questions that had pictures', () => {
    const r = word(['1. Look at the graph.', IMAGE_MARK, 'A. a', 'B. b', 'C. c', 'D. d', 'Answer: A'].join('\n'))
    expect(r.warnings).toContainEqual({ key: 'exams.upload.warnings.imagesSkipped', values: { numbers: '1', count: 1 } })
  })

  it('fails clearly when there are no numbered questions', () => {
    expect(() => word('Just some text\nwith no questions')).toThrow(ImportError)
  })
})

describe('PDF text (lines rebuilt from positions)', () => {
  it('joins wrapped question lines with spaces and continues wrapped options', () => {
    const r = pdf(`Ethiopian Grade 12 Model Exam — Physics
1. A ball is thrown straight up with a speed of 20 m/s. How long does it take
to reach the highest point? (g = 10 m/s²)
A. 1 s B. 2 s C. 3 s D. 4 s
2. Which of the following statements about the photoelectric effect is
correct?
A. The number of electrons depends only on the frequency of the light
and not on its intensity
B. The kinetic energy depends on the intensity
C. Electrons are emitted only above a threshold frequency
D. It shows light is only a wave
Answer key: 1. B 2. C`)
    expect(simple(r)).toEqual([
      {
        n: 1,
        body: 'A ball is thrown straight up with a speed of 20 m/s. How long does it take to reach the highest point? (g = 10 m/s²)',
        options: ['1 s', '2 s', '3 s', '4 s'],
        correct: 'B',
      },
      {
        n: 2,
        body: 'Which of the following statements about the photoelectric effect is correct?',
        options: [
          'The number of electrons depends only on the frequency of the light and not on its intensity',
          'The kinetic energy depends on the intensity',
          'Electrons are emitted only above a threshold frequency',
          'It shows light is only a wave',
        ],
        correct: 'C',
      },
    ])
  })
})
