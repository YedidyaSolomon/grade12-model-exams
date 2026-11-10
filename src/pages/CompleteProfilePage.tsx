import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loading } from '@/components/states'
import { useProfile, profileQueryKey } from '@/auth/useProfile'
import { supabase, type Enums, type Profile } from '@/lib/supabase'
import { cn } from '@/lib/utils'

type Stream = Enums<'stream_type'>
type FieldErrors = Partial<Record<'fullName' | 'school' | 'stream', string>>

export default function CompleteProfilePage() {
  const profile = useProfile()
  if (profile.isPending || !profile.data) return <Loading fullScreen />
  return <ProfileForm profile={profile.data} />
}

function ProfileForm({ profile }: { profile: Profile }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const streamLocked = profile.stream !== null
  const [fullName, setFullName] = useState(profile.full_name ?? '')
  const [school, setSchool] = useState(profile.school ?? '')
  const [stream, setStream] = useState<Stream | null>(profile.stream)
  const [errors, setErrors] = useState<FieldErrors>({})

  const save = useMutation({
    mutationFn: async () => {
      const patch: { full_name: string; school: string; stream?: Stream } = {
        full_name: fullName.trim(),
        school: school.trim(),
      }
      // The database rejects stream changes once set; only send it the first time.
      if (!streamLocked && stream) patch.stream = stream
      const { data, error } = await supabase
        .from('profiles')
        .update(patch)
        .eq('id', profile.id)
        .select('*')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      queryClient.setQueryData(profileQueryKey(profile.id), data)
      void navigate('/', { replace: true })
    },
  })

  function validate(): boolean {
    const next: FieldErrors = {}
    const n = fullName.trim().length
    const s = school.trim().length
    if (n < 2 || n > 120) next.fullName = t('profile.errors.fullName')
    if (s < 2 || s > 160) next.school = t('profile.errors.school')
    if (!stream) next.stream = t('profile.errors.stream')
    setErrors(next)
    return Object.keys(next).length === 0
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (validate()) save.mutate()
  }

  const streams: Stream[] = ['natural', 'social']

  return (
    <main className="mx-auto flex min-h-dvh max-w-md items-start p-4 sm:items-center">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>{t('profile.title')}</CardTitle>
          <CardDescription>{t('profile.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={onSubmit} noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="full_name">{t('profile.fullName')}</Label>
              <Input
                id="full_name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
                maxLength={120}
                aria-invalid={!!errors.fullName}
                aria-describedby="full_name_hint full_name_err"
              />
              <p id="full_name_hint" className="text-xs text-muted-foreground">
                {t('profile.fullNameHint')}
              </p>
              {errors.fullName && (
                <p id="full_name_err" className="text-sm text-destructive">{errors.fullName}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="school">{t('profile.school')}</Label>
              <Input
                id="school"
                value={school}
                onChange={(e) => setSchool(e.target.value)}
                placeholder={t('profile.schoolPlaceholder')}
                autoComplete="organization"
                maxLength={160}
                aria-invalid={!!errors.school}
                aria-describedby="school_err"
              />
              {errors.school && (
                <p id="school_err" className="text-sm text-destructive">{errors.school}</p>
              )}
            </div>

            <fieldset className="space-y-2" aria-describedby="stream_help stream_err">
              <legend className="text-sm font-medium">{t('profile.stream')}</legend>
              <div className="grid grid-cols-2 gap-3">
                {streams.map((s) => (
                  <label
                    key={s}
                    className={cn(
                      'flex min-h-14 cursor-pointer items-center gap-2 rounded-lg border-2 p-3 text-sm font-medium',
                      'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                      stream === s ? 'border-primary bg-primary/5' : 'border-border bg-card',
                      streamLocked && 'cursor-not-allowed opacity-60',
                    )}
                  >
                    <input
                      type="radio"
                      name="stream"
                      value={s}
                      checked={stream === s}
                      onChange={() => setStream(s)}
                      disabled={streamLocked}
                      className="size-4 accent-[var(--primary)]"
                    />
                    {t(`profile.${s}`)}
                  </label>
                ))}
              </div>
              {streamLocked ? (
                <p id="stream_help" className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Lock className="size-3" aria-hidden /> {t('profile.streamLocked')}
                </p>
              ) : (
                <Alert variant="warning" id="stream_help">
                  <AlertDescription>{t('profile.streamWarning')}</AlertDescription>
                </Alert>
              )}
              {errors.stream && (
                <p id="stream_err" className="text-sm text-destructive">{errors.stream}</p>
              )}
            </fieldset>

            {save.isError && (
              <Alert variant="destructive">
                <AlertDescription>{save.error.message}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" size="lg" className="w-full" disabled={save.isPending}>
              {save.isPending ? t('common.saving') : t('profile.submit')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
