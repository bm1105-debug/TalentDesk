// What this file does: defines all client-side routes.
// Protected routes sit inside the Layout shell and redirect to /login if unauth'd.
// The root path redirects to /dashboard.

import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from '@/components/Layout'
import ProtectedRoute from '@/components/ProtectedRoute'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import Candidates from '@/pages/Candidates'
import Jobs from '@/pages/Jobs'
import Submittals from '@/pages/Submittals'
import Interviews from '@/pages/Interviews'
import Communications from '@/pages/Communications'
import Search from '@/pages/Search'
import CandidateDetail from '@/pages/CandidateDetail'
import Reports from '@/pages/Reports'
import Analytics from '@/pages/Analytics'
import Scorecard from '@/pages/Scorecard'
import ActivityLog from '@/pages/ActivityLog'
import Offers from '@/pages/Offers'

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<Login />} />

      {/* Protected — all children share the Layout shell */}
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard"      element={<Dashboard />} />
        <Route path="candidates"     element={<Candidates />} />
        <Route path="candidates/:id" element={<CandidateDetail />} />
        <Route path="jobs"           element={<Jobs />} />
        <Route path="submittals"     element={<Submittals />} />
        <Route path="interviews"     element={<Interviews />} />
        <Route path="communications" element={<Communications />} />
        <Route path="search"         element={<Search />} />
        <Route path="reports"        element={<Reports />} />
        <Route path="analytics"      element={<Analytics />} />
        <Route path="scorecard"      element={<Scorecard />} />
        <Route path="activity"       element={<ActivityLog />} />
        <Route path="offers"         element={<Offers />} />
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
