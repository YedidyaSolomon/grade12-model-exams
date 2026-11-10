import { useTranslation } from 'react-i18next'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

// Phase 1 placeholder. Stats (students, active exams, writing now) come in Phase 5.
export default function OverviewPage() {
  const { t } = useTranslation()
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold">{t('admin.overview')}</h1>
      <Card>
        <CardHeader>
          <CardTitle>{t('admin.title')}</CardTitle>
          <CardDescription>{t('admin.overviewSoon')}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}
