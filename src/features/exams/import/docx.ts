// Loaded only from the admin Import tab (dynamic import), so students never download mammoth.
import mammoth from 'mammoth'
import { ImportError, type ImportResult, type ImportWarning } from './common'
import { mammothToParagraphs, paragraphsToLines } from './docxLines'
import { parseQuestionLines } from './textParser'

/** Word (.docx) only; old .doc files must be re-saved as .docx first. */
export async function readDocx(file: File): Promise<ImportResult> {
  let doc: Parameters<typeof mammothToParagraphs>[0] | null = null
  let messages: { message: string }[] = []
  try {
    const result = await mammoth.convertToHtml(
      { arrayBuffer: await file.arrayBuffer() },
      {
        // We only want the document tree (text, lists, picture positions), not HTML.
        transformDocument: (element: unknown) => {
          doc = element as typeof doc
          return element
        },
        // Don't read picture data: pictures aren't imported, only counted per question.
        convertImage: mammoth.images.imgElement(() => Promise.resolve({ src: '' })),
      },
    )
    messages = result.messages
  } catch {
    throw new ImportError('exams.upload.errors.unreadable')
  }
  if (!doc) throw new ImportError('exams.upload.errors.unreadable')

  const lines = paragraphsToLines(mammothToParagraphs(doc))
  const parsed = parseQuestionLines(lines, { joinBody: '\n' })

  // Equations (Word "Insert → Equation") are dropped by the reader; it only tells us how many.
  const equations = messages.filter((m) => /m:oMath(Para)?$/.test(m.message)).length
  const warnings: ImportWarning[] = [...parsed.warnings]
  if (equations > 0) warnings.push({ key: 'exams.upload.warnings.equationsSkipped', values: { count: equations } })
  return { questions: parsed.questions, warnings }
}
