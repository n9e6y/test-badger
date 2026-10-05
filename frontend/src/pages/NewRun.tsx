import { ArrowLeft, Loader2, ShoppingCart, UserPlus } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { useProject, useStartRun } from '@/api/hooks'
import type { TestType } from '@/api/types'
import { ErrorState, FullPageSpinner } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const TYPES: { key: TestType; title: string; text: string; icon: typeof UserPlus }[] = [
  { key: 'registration', title: 'Registration', text: 'Signup with valid and invalid data, then login', icon: UserPlus },
  { key: 'store', title: 'Store', text: 'Cart, coupons, stock, checkout up to payment', icon: ShoppingCart },
]

export function NewRun() {
  const { projectId = '' } = useParams()
  const project = useProject(projectId)
  const start = useStartRun()
  const navigate = useNavigate()
  const [type, setType] = useState<TestType>('registration')
  const [goal, setGoal] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  if (project.isPending) return <FullPageSpinner />
  if (project.isError) return <ErrorState message={project.error.message} onRetry={() => project.refetch()} />

  const submit = (e: FormEvent) => {
    e.preventDefault()
    start.mutate(
      {
        projectId,
        input: {
          test_type: type,
          goal_text: goal.trim() || undefined,
          test_email: email.trim() || undefined,
          test_password: password || undefined,
        },
      },
      { onSuccess: (run) => navigate(`/app/runs/${run.id}`) },
    )
  }

  return (
    <form onSubmit={submit} className="mx-auto grid w-full max-w-2xl gap-6" noValidate>
      <Link to={`/app/projects/${projectId}`} className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> {project.data.name}
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">New test run</h1>

      <fieldset className="grid gap-3">
        <legend className="mb-2 font-medium">1. What should we test?</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {TYPES.map(({ key, title, text, icon: Icon }) => (
            <label key={key}
              className={cn('cursor-pointer rounded-xl border-2 bg-background p-5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                type === key ? 'border-foreground' : 'border-transparent hover:border-border')}>
              <input type="radio" name="test-type" value={key} checked={type === key} onChange={() => setType(key)} className="sr-only" />
              <Icon className="size-5" aria-hidden />
              <p className="mt-3 font-medium">{title}</p>
              <p className="text-sm text-muted-foreground">{text}</p>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="grid gap-4 rounded-xl border bg-background p-5">
        <legend className="px-1 font-medium">2. Details (all optional)</legend>
        <div className="grid gap-1.5">
          <Label htmlFor="goal">Goal or notes</Label>
          <textarea id="goal" value={goal} onChange={(e) => setGoal(e.target.value)} rows={3} maxLength={2000}
            placeholder={type === 'store' ? 'e.g. Valid coupon is WELCOME10, expired coupon is SUMMER24' : 'e.g. Passwords need at least 8 characters'}
            className="rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="test-email">Test account email</Label>
            <Input id="test-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="test-password">Test account password</Label>
            <Input id="test-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Only needed if your site requires a login. The password is stored encrypted and never shown to the AI.
        </p>
      </fieldset>

      {start.isError && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{start.error.message}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Takes about 5–8 minutes. You'll review the plan before anything runs.</p>
        <Button type="submit" size="lg" disabled={start.isPending}>
          {start.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Start
        </Button>
      </div>
    </form>
  )
}
