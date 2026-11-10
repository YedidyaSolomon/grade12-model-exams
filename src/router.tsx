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
const RulesPage = lazy(() => import('@/pages/exam/RulesPage'))
const ExamRoomPage = lazy(() => import('@/pages/exam/ExamRoomPage'))
const ResultPage = lazy(() => import('@/pages/exam/ResultPage'))
const LeaderboardPage = lazy(() => import('@/pages/exam/LeaderboardPage'))
const AdminLayout = lazy(() => import('@/layouts/AdminLayout'))
const AdminOverviewPage = lazy(() => import('@/pages/admin/OverviewPage'))
const AdminExamsListPage = lazy(() => import('@/pages/admin/ExamsListPage'))
const AdminExamEditorPage = lazy(() => import('@/pages/admin/ExamEditorPage'))
const AdminExamManagePage = lazy(() => import('@/pages/admin/ExamManagePage'))
const AdminStudentsPage = lazy(() => import('@/pages/admin/StudentsPage'))
const AdminStudentDetailPage = lazy(() => import('@/pages/admin/StudentDetailPage'))
const AdminRequestsPage = lazy(() => import('@/pages/admin/RequestsPage'))

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
      // Exam flow is full-screen (no student header) to maximise space on phones.
      { path: '/exam/:examId', element: s(<RulesPage />) },
      { path: '/exam/:examId/room', element: s(<ExamRoomPage />) },
      { path: '/exam/:examId/result', element: s(<ResultPage />) },
      { path: '/exam/:examId/leaderboard', element: s(<LeaderboardPage />) },
      {
        element: <RequireAdmin />,
        children: [
          {
            path: '/admin',
            element: s(<AdminLayout />),
            children: [
              { index: true, element: s(<AdminOverviewPage />) },
              { path: 'exams', element: s(<AdminExamsListPage />) },
              { path: 'exams/new', element: s(<AdminExamEditorPage />) },
              { path: 'exams/:id', element: s(<AdminExamEditorPage />) },
              { path: 'exams/:id/manage', element: s(<AdminExamManagePage />) },
              { path: 'students', element: s(<AdminStudentsPage />) },
              { path: 'students/:id', element: s(<AdminStudentDetailPage />) },
              { path: 'requests', element: s(<AdminRequestsPage />) },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])
