import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'

/**
 * Go to /suspended after the server said "banned". The cached profile still says
 * "not banned", and RequireAuth would bounce /suspended back to / (and the dashboard back
 * to /suspended, forever), so refetch the profile first.
 */
export function useGoSuspended() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  return useCallback(async () => {
    await qc.refetchQueries({ queryKey: ['profile'] })
    void navigate('/suspended', { replace: true })
  }, [qc, navigate])
}
