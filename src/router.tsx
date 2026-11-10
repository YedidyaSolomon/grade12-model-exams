import { lazy, Suspense, type ReactNode } from 'react'
import { createBrowserRouter } from 'react-router'
import { Loading } from '@/components/states'
import { RedirectIfSignedIn, RequireAdmin, RequireAuth } from '@/auth/guards'
import StudentLayout from '@/layouts/StudentLayout'
import LoginPage from '@/pages/LoginPage'
import AuthCallbackPage from '@/pages/AuthCallbackPage'
import DashboardPage from '@/pages/student/DashboardPage'
import NotFoundPage from '@/pages/NotFoundPage'

// Rarely-visited / admin pages are split out so students on mobile data don't download them.
const CompleteProfilePage = lazy(() => import('@/pages/CompleteProfilePage'))
const SuspendedPage = lazy(() => import('@/pages/SuspendedPage'))
const AdminLayout = lazy(() => import('@/layouts/AdminLayout'))
const AdminOverviewPage = lazy(() => import('@/pages/admin/OverviewPage'))

const s = (node: ReactNode) => <Suspense fallback={<Loading fullScreen />}>{node}</Suspense>

export const router = createBrowserRouter([
  {
    element: <RedirectIfSignedIn />,
    children: [{ path: '/login', element: <LoginPage /> }],
  },
  { path: '/auth/callback', element: <AuthCallbackPage /> },
  {
    element: <RequireAuth />,
    children: [
      { path: '/suspended', element: s(<SuspendedPage />) },
      { path: '/complete-profile', element: s(<CompleteProfilePage />) },
      {
        element: <StudentLayout />,
        children: [{ path: '/', element: <DashboardPage /> }],
      },
      {
        element: <RequireAdmin />,
        children: [
          {
            path: '/admin',
            element: s(<AdminLayout />),
            children: [{ index: true, element: s(<AdminOverviewPage />) }],
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])
