import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router'
import { FullPageSpinner, RequireAuth, RequireRole } from './components/RouteGuards'
import { AppLayout } from './layouts/AppLayout'
import { DashboardPage } from './pages/DashboardPage'
import { EpisodesPage } from './pages/EpisodesPage'
import { LoginPage } from './pages/LoginPage'
import { NewRequestPage } from './pages/NewRequestPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { RequestDetailPage } from './pages/RequestDetailPage'
import { RequestsPage } from './pages/RequestsPage'
import { UsersPage } from './pages/UsersPage'

// The charting library is only needed here, so it is loaded on demand.
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage').then((module) => ({ default: module.AnalyticsPage })))

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="requests" element={<RequestsPage />} />
        <Route
          path="requests/new"
          element={
            <RequireRole roles={['client']}>
              <NewRequestPage />
            </RequireRole>
          }
        />
        <Route path="requests/:requestId" element={<RequestDetailPage />} />
        <Route
          path="episodes"
          element={
            <RequireRole roles={['operator', 'admin']}>
              <EpisodesPage />
            </RequireRole>
          }
        />
        <Route
          path="analytics"
          element={
            <RequireRole roles={['operator', 'admin']}>
              <Suspense fallback={<FullPageSpinner />}>
                <AnalyticsPage />
              </Suspense>
            </RequireRole>
          }
        />
        <Route
          path="users"
          element={
            <RequireRole roles={['admin']}>
              <UsersPage />
            </RequireRole>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
