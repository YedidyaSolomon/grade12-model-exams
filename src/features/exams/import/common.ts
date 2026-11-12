import type { DraftQuestion } from '../types'

export type ImportWarning = { key: string; values?: Record<string, string | number> }
export type ImportResult = { questions: DraftQuestion[]; warnings: ImportWarning[] }

/** A failure the admin can act on; `key` is an i18n key under exams.upload.errors. */
export class ImportError extends Error {
  constructor(
    public key: string,
    public values?: Record<string, string | number>,
  ) {
    super(key)
  }
}

/** Placeholder line for a picture found in a Word file (pictures are not imported). */
export const IMAGE_MARK = '\u0000[image]'

/** Hard stop so a huge file can't freeze the tab. The 300-question limit is checked later. */
export const MAX_IMPORTED_QUESTIONS = 1000
