// Loaded only from the admin Import tab (dynamic import), so students never download pdfjs.
import { getDocument, GlobalWorkerOptions, PasswordException } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { ImportError, type ImportResult } from './common'
import { readPdfPages } from './pdfLines'

GlobalWorkerOptions.workerSrc = workerUrl

/** Typed PDFs only: text is read from the PDF's text layer (no OCR for scanned pages). */
export async function readPdf(file: File): Promise<ImportResult> {
  const task = getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  try {
    let doc
    try {
      doc = await task.promise
    } catch (e) {
      if (e instanceof PasswordException) throw new ImportError('exams.upload.errors.pdfPassword')
      throw new ImportError('exams.upload.errors.unreadable')
    }
    return await readPdfPages(doc)
  } finally {
    void task.destroy()
  }
}
