import { Link, Route, Routes } from 'react-router-dom'

import { AppLayout } from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/button'
import { Login, Signup } from '@/pages/Auth'
import { Dashboard } from '@/pages/Dashboard'
import { Landing } from '@/pages/Landing'
import { NewProject } from '@/pages/NewProject'
import { NewRun } from '@/pages/NewRun'
import { ProjectPage } from '@/pages/ProjectPage'
import { RunPage } from '@/pages/RunPage'
import { Runs } from '@/pages/Runs'
import { Sites } from '@/pages/Sites'

function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-4xl">Page not found</h1>
      <p className="text-muted-foreground">The badger dug here and found nothing.</p>
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
        <Route path="sites" element={<Sites />} />
        <Route path="runs" element={<Runs />} />
        <Route path="projects/new" element={<NewProject />} />
        <Route path="projects/:projectId" element={<ProjectPage />} />
        <Route path="projects/:projectId/runs/new" element={<NewRun />} />
        <Route path="runs/:runId" element={<RunPage />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
