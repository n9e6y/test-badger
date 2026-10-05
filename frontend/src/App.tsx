import { Link, Route, Routes } from 'react-router-dom'

import { AppLayout } from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/button'
import { Login, Signup } from '@/pages/Auth'
import { Dashboard } from '@/pages/Dashboard'
import { Landing } from '@/pages/Landing'

function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <Button asChild>
        <Link to="/">Go home</Link>
      </Button>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/login" element={<Login />} />
      <Route path="/app" element={<AppLayout />}>
        <Route index element={<Dashboard />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
