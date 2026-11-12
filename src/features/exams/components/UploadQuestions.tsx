import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, CheckCircle2, Download, FileText, FileUp, ImageOff, Loader2, Paperclip, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useConfirm } from '@/components/ConfirmDialog'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import {
  IMPORT_ACCEPT,
  IMPORT_CONTENT_TYPE,
  ImportError,
  importKind,
  MAX_FILE_BYTES,
  MAX_PDF_BYTES,
  preloadImporters,
  readQuestionFile,
  templateCsv,
  type ImportKind,
  type ImportResult,
} from '../importQuestions'
import { examSourceDownloadUrl, isStoredSource, sourceFileName, uploadExamSource } from '../api'
import { numberingProblems, questionProblems } from '../validation'
import type { DraftQuestion } from '../types'

type Parsed = ImportResult & { file: File; kind: ImportKind }

const WORD_TEMPLATE_URL = '/templates/question-template.docx'

/**
 * Import questions from Excel (.xlsx), CSV, Word (.docx) or a typed PDF into the draft.
 * The questions land in the preview table, where the usual checks flag anything to fix
 * (and Publish stays blocked until they are fixed). On "Add", the original file is saved
 * to the private exam-sources bucket and linked to the exam when it is saved.
 */
export function UploadQuestions({
  existingCount,
  sourceFile,
  onImport,
}: {
  existingCount: number
  /** exams.source_file of the draft: a storage path (or, for old drafts, just a name) */
  sourceFile: string | null
  onImport: (questions: DraftQuestion[], mode: 'replace' | 'append', fileName: string, sourcePath: string | null) => void
}) {
  const { t } = useTranslation()
  const [confirm, confirmDialog] = useConfirm()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [parsed, setParsed] = useState<Parsed | null>(null)

  // The Word/PDF readers are separate chunks; fetch them as soon as the admin opens this tab.
  useEffect(() => preloadImporters(), [])

  const summary = useMemo(() => {
    if (!parsed) return null
    const needFix = parsed.questions.filter((q) => questionProblems(q).length > 0).length
    return { needFix, numbering: numberingProblems(parsed.questions) }
  }, [parsed])

  async function handleFile(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setError(null)
    setSaveError(null)
    setParsed(null)
    try {
      const result = await readQuestionFile(file)
      setParsed({ ...result, file, kind: importKind(file.name)! })
    } catch (e) {
      setError(e instanceof ImportError ? t(e.key, e.values ?? {}) : t('exams.upload.errors.unreadable'))
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = '' // allow picking the same file again
    }
  }

  async function apply(mode: 'replace' | 'append') {
    if (!parsed) return
    if (mode === 'replace' && existingCount > 0) {
      const ok = await confirm({
        title: t('exams.upload.confirmReplaceTitle'),
        description: t('exams.upload.confirmReplaceBody', { count: existingCount, file: parsed.file.name }),
        confirmLabel: t('exams.upload.replace'),
        destructive: true,
      })
      if (!ok) return
    }
    // Keep the original file. If that fails the questions are still added (they're what
    // matters); the admin is told and can import the file again later to attach it.
    setSaving(true)
    let path: string | null = null
    try {
      path = await uploadExamSource(parsed.file, IMPORT_CONTENT_TYPE[parsed.kind])
    } catch (e) {
      setSaveError(t('exams.upload.sourceSaveFailed', { message: errorMessage(e) }))
    }
    setSaving(false)
    onImport(parsed.questions, mode, parsed.file.name, path)
    setParsed(null)
  }

  function downloadCsvTemplate() {
    const url = URL.createObjectURL(new Blob([templateCsv()], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'questions-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function downloadSource(path: string) {
    try {
      window.location.assign(await examSourceDownloadUrl(path))
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    void handleFile(e.dataTransfer.files[0])
  }

  const textFile = parsed && (parsed.kind === 'docx' || parsed.kind === 'pdf')

  return (
    <div className="space-y-3">
      {confirmDialog}

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-5 text-center transition-colors sm:p-6',
          dragging ? 'border-primary bg-primary-soft' : 'border-input bg-background',
        )}
      >
        <span aria-hidden className="grid size-12 place-items-center rounded-lg bg-primary-soft text-primary">
          {busy ? <Loader2 className="size-6 animate-spin" /> : <FileUp className="size-6" />}
        </span>
        <div>
          <p className="font-bold text-primary">{t('exams.upload.title')}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('exams.upload.hint', { mb: MAX_FILE_BYTES / 1024 / 1024, pdfMb: MAX_PDF_BYTES / 1024 / 1024 })}
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button type="button" onClick={() => inputRef.current?.click()} disabled={busy || saving}>
            <Upload aria-hidden /> {busy ? t('exams.upload.reading') : t('exams.upload.choose')}
          </Button>
          <Button type="button" variant="outline" onClick={downloadCsvTemplate}>
            <Download aria-hidden /> {t('exams.upload.template')}
          </Button>
          <Button asChild variant="outline">
            <a href={WORD_TEMPLATE_URL} download="question-template.docx">
              <FileText aria-hidden /> {t('exams.upload.wordTemplate')}
            </a>
          </Button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={IMPORT_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />

        {/* Short format guide: what each kind of file must look like. */}
        <div className="grid w-full max-w-2xl gap-2 border-t pt-3 text-left text-xs text-muted-foreground sm:grid-cols-2">
          <div>
            <p className="font-bold text-foreground">{t('exams.upload.excelHeading')}</p>
            <p className="mt-0.5">{t('exams.upload.columns')}</p>
          </div>
          <div>
            <p className="font-bold text-foreground">{t('exams.upload.wordHeading')}</p>
            <pre className="mt-1 overflow-x-auto rounded-md bg-card px-2 py-1.5 font-mono text-[0.6875rem] leading-relaxed text-foreground">
              {t('exams.upload.wordExample')}
            </pre>
            <p className="mt-1">{t('exams.upload.wordKeyHint')}</p>
            <p className="mt-1">{t('exams.upload.pdfHint')}</p>
          </div>
        </div>
        <p className="flex items-start gap-1.5 text-left text-xs text-muted-foreground">
          <ImageOff className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t('exams.upload.noImages')}
        </p>
      </div>

      {isStoredSource(sourceFile) && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <Paperclip className="size-4 text-muted-foreground" aria-hidden />
          <span className="text-muted-foreground">{t('exams.upload.originalFile')}</span>
          <span className="font-semibold break-all">{sourceFileName(sourceFile)}</span>
          <button
            type="button"
            onClick={() => void downloadSource(sourceFile)}
            className="inline-flex items-center gap-1 font-bold text-primary hover:underline"
          >
            <Download className="size-3.5" aria-hidden /> {t('exams.upload.downloadOriginal')}
          </button>
        </p>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {saveError && (
        <Alert variant="warning">
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      )}

      {parsed && summary && (
        <div className="space-y-3 rounded-xl border-2 border-primary/30 bg-primary-soft/40 p-4" aria-live="polite">
          <div>
            <p className="font-extrabold text-primary">
              {t('exams.upload.found', { count: parsed.questions.length, file: parsed.file.name })}
            </p>
            {summary.needFix > 0 || summary.numbering.length > 0 ? (
              <p className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-destructive">
                <AlertTriangle className="size-4 shrink-0" aria-hidden />
                {summary.needFix > 0 ? t('exams.upload.needFix', { count: summary.needFix }) : t('exams.upload.numberingOnly')}
              </p>
            ) : (
              <p className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-success">
                <CheckCircle2 className="size-4 shrink-0" aria-hidden /> {t('exams.upload.allComplete')}
              </p>
            )}
          </div>

          {(summary.numbering.length > 0 || parsed.warnings.length > 0) && (
            <ul className="space-y-1 text-sm">
              {[...summary.numbering, ...parsed.warnings].slice(0, 8).map((w, i) => (
                <li key={i} className="flex items-start gap-2 text-warning">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span className="text-foreground">{t(w.key, w.values ?? {})}</span>
                </li>
              ))}
              {summary.numbering.length + parsed.warnings.length > 8 && (
                <li className="pl-6 text-muted-foreground">
                  {t('exams.upload.moreWarnings', { count: summary.numbering.length + parsed.warnings.length - 8 })}
                </li>
              )}
            </ul>
          )}
          {textFile && (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <ImageOff className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t('exams.upload.noImagesAfter')}
            </p>
          )}
          <p className="text-xs text-muted-foreground">{t('exams.upload.reviewHint')}</p>
          <div className="flex flex-wrap gap-2">
            {existingCount > 0 ? (
              <>
                <Button type="button" onClick={() => void apply('append')} disabled={saving}>
                  {saving ? t('exams.upload.savingOriginal') : t('exams.upload.append', { count: existingCount })}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="text-destructive"
                  onClick={() => void apply('replace')}
                  disabled={saving}
                >
                  {t('exams.upload.replace')}
                </Button>
              </>
            ) : (
              <Button type="button" onClick={() => void apply('replace')} disabled={saving}>
                {saving ? t('exams.upload.savingOriginal') : t('exams.upload.add')}
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={() => setParsed(null)} disabled={saving}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
