import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { usePrompt } from '@/components/PromptDialog'
import { errorMessage } from '@/lib/errors'
import { studentErrorCode, useRequestReexam } from '../api'
import type { DashboardExam } from '../types'

/** Under a closed exam: the admin's note on a reviewed request, and the request button. */
export function ReexamRequest({ exam }: { exam: DashboardExam }) {
  const { t } = useTranslation()
  const [prompt, dialog] = usePrompt()
  const request = useRequestReexam()
  const r = exam.reexam_request

  async function onRequest() {
    const reason = await prompt({
      title: t('reexamRequest.title', { title: exam.title }),
      description: t('reexamRequest.body'),
      label: t('reexamRequest.reason'),
      placeholder: t('reexamRequest.placeholder'),
      minLength: 5,
      maxLength: 1000,
      confirmLabel: t('reexamRequest.send'),
    })
    if (reason !== null) request.mutate({ examId: exam.id, reason })
  }

  const code = request.isError ? studentErrorCode(request.error) : null

  return (
    <div className="space-y-2">
      {dialog}
      {r?.admin_note && (
        <p className="text-sm">
          <span className="text-muted-foreground">{t('reexamRequest.adminNote')}:</span> {r.admin_note}
        </p>
      )}
      {r?.status === 'approved' && <p className="text-xs text-muted-foreground">{t('reexamRequest.approvedHint')}</p>}
      {exam.can_request_reexam && (
        <Button size="sm" variant="outline" onClick={() => void onRequest()} disabled={request.isPending}>
          {request.isPending ? t('reexamRequest.sending') : t('reexamRequest.action')}
        </Button>
      )}
      {request.isError && (
        <p role="alert" className="text-sm text-destructive">
          {code ? t(`errors.${code}`) : errorMessage(request.error)}
        </p>
      )}
    </div>
  )
}
