import { Route, Routes } from 'react-router-dom'
import ProtectedRoute from '@/components/ProtectedRoute.js'
import Dashboard from '@/pages/Dashboard.js'
import DownloadTokens from '@/pages/DownloadTokens.js'
import Login from '@/pages/Login.js'
import NotFound from '@/pages/NotFound.js'
import PendingUploads from '@/pages/PendingUploads.js'
import Register from '@/pages/Register.js'
import UploadManager from '@/pages/UploadManager.js'

const AppRoutes = () => (
  <Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/register" element={<Register />} />
    <Route element={<ProtectedRoute />}>
      <Route path="/" element={<Dashboard />} />
      <Route path="/upload" element={<UploadManager />} />
      <Route path="/pending" element={<PendingUploads />} />
      <Route path="/download" element={<DownloadTokens />} />
    </Route>
    <Route path="*" element={<NotFound />} />
  </Routes>
)

export default AppRoutes
