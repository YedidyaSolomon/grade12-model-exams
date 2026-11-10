import { Navigate, Outlet, useLocation } from 'react-router'
import { ErrorState, Loading } from '@/components/states'
import { useAuth } from './AuthProvider'
import { useProfile } from './useProfile'

/**
 * UX routing only — never a security boundary. Every rule here is enforced again in
 * Postgres (RLS, column grants, security definer RPCs).
 */

/** Signed in + profile loaded. Banned -> /suspended. Incomplete -> /complete-profile. */
export function RequireAuth() {
  const { session, initializing } = useAuth()
  const location = useLocation()
  const profile = useProfile()

  if (initializing) return <Loading fullScreen />
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (profile.isPending) return <Loading fullScreen />
  if (profile.isError)
    return <ErrorState fullScreen message={profile.error.message} onRetry={() => void profile.refetch()} />

  const p = profile.data
  const path = location.pathname

  if (p.is_banned) {
    return path === '/suspended' ? <Outlet /> : <Navigate to="/suspended" replace />
  }
  if (path === '/suspended') return <Navigate to="/" replace />

  // Admins don't need student fields to use /admin.
  if (!p.is_complete && p.role !== 'admin' && path !== '/complete-profile') {
    return <Navigate to="/complete-profile" replace />
  }
  return <Outlet />
}

export function RequireAdmin() {
  const profile = useProfile()
  if (profile.isPending) return <Loading fullScreen />
  if (profile.isError || profile.data.role !== 'admin') return <Navigate to="/" replace />
  return <Outlet />
}

/** For /login: already signed in -> go home. */
export function RedirectIfSignedIn() {
  const { session, initializing } = useAuth()
  if (initializing) return <Loading fullScreen />
  if (session) return <Navigate to="/" replace />
  return <Outlet />
}
