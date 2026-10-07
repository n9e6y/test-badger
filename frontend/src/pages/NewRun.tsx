import { AlertCircle, ArrowLeft, ArrowRight, Check, Globe, Layers, Loader2, ShoppingCart, UserPlus } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { toast } from 'sonner'

import { type TestChoice, useProject, useStartTests } from '@/api/hooks'
import { Corners } from '@/components/common/Corners'
import { ErrorState, FullPageSpinner } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const TYPES: { key: TestChoice; title: string; text: string; icon: typeof UserPlus }[] = [
  {
    key: 'registration',
    title: 'Registration',
    text: 'Signup with valid and invalid data, duplicate accounts, then login.',
    icon: UserPlus,
  },
  {
    key: 'store',
    title: 'Store & checkout',
    text: 'Cart, quantities, coupons, stock and checkout up to the payment step.',
    icon: ShoppingCart,
  },
  {
    key: 'both',
    title: 'Both',
    text: 'Runs the Registration test and the Store test, one after the other. You approve each plan and get two reports.',
    icon: Layers,
  },
]

/** Card-style radio option, as in the design (role=radio inside a radiogroup). */
function OptionCard({
  checked,
  onSelect,
  children,
}: {
  checked: boolean
  onSelect: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={cn(
        'relative flex min-w-0 flex-col gap-2 border p-[18px] text-left',
        checked ? 'border-primary bg-steel-100 shadow-[0_0_0_1px_var(--primary)]' : 'hover:bg-accent',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'absolute top-[18px] right-[18px] grid size-[22px] place-items-center border',
          checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
        )}
      >
        {checked && <Check className="size-3.5" />}
      </span>
      {children}
    </button>
  )
}

export function NewRun() {
  const { projectId = '' } = useParams()
  const project = useProject(projectId)
  const start = useStartTests()
  const navigate = useNavigate()
  const [type, setType] = useState<TestChoice>('registration')
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
        choice: type,
        input: {
          goal_text: goal.trim() || undefined,
          test_email: email.trim() || undefined,
          test_password: password || undefined,
        },
      },
      {
        onSuccess: ({ runs, notStarted }) => {
          if (notStarted) toast.error(`The Store run was not started: ${notStarted}`)
          else if (runs.length > 1) toast.success('Two runs started. The Store plan will be waiting for you too.')
          navigate(`/app/runs/${runs[0].id}`)
        },
      },
    )
  }

  return (
    <form onSubmit={submit} className="mx-auto flex w-full max-w-[860px] flex-col gap-7" noValidate>
      <Button variant="ghost" asChild className="-ml-3.5 w-fit">
        <Link to={`/app/projects/${projectId}`}>
          <ArrowLeft aria-hidden /> {project.data.name}
        </Link>
      </Button>
      <div>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Globe className="size-4 shrink-0 stroke-[1.5]" aria-hidden />
          <span className="break-all">{project.data.base_url}</span>
        </p>
        <h1 className="mt-1.5 text-[clamp(30px,3vw,40px)]">New run</h1>
      </div>

      <section className="flex flex-col gap-3">
        <h2 id="type-title" className="text-xl">1 · What should it test?</h2>
        <div role="radiogroup" aria-labelledby="type-title" className="grid gap-4 sm:grid-cols-3">
          {TYPES.map(({ key, title, text, icon: Icon }) => (
            <OptionCard key={key} checked={type === key} onSelect={() => setType(key)}>
              <Icon className="size-6 stroke-[1.5] text-steel-700" aria-hidden />
              <span className="font-heading text-[22px] font-semibold">{title}</span>
              <span className="text-sm text-pretty">{text}</span>
            </OptionCard>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl">2 · Details (all optional)</h2>
        <div className="blueprint flex flex-col gap-4 p-5">
          <Corners />
          <div className="grid gap-1.5">
            <Label htmlFor="goal">Goal or notes for the agent</Label>
            <textarea
              id="goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder={
                type === 'store'
                  ? 'e.g. Valid coupon is WELCOME10, expired coupon is SUMMER24'
                  : 'e.g. Passwords need at least 8 characters'
              }
              className="min-h-[90px] border border-input bg-surface px-2.5 py-2 text-base placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-offset-0"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="test-email">Test account email</Label>
              <Input id="test-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="test-password">Test account password</Label>
              <Input
                id="test-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Only needed if your site requires a login. The password is stored encrypted and never shown to the AI.
          </p>
        </div>
      </section>

      {start.isError && (
        <div role="alert" className="flex gap-2 border border-v-bug-bd bg-v-bug-bg px-3 py-2.5 text-sm">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-v-bug" aria-hidden />
          <span>{start.error.message}</span>
        </div>
      )}
      <div className="blueprint flex flex-wrap items-center gap-x-6 gap-y-4 px-5 py-[18px]">
        <Corners />
        <p className="flex-[1_1_320px] text-sm text-pretty">
          The agent first explores the site (about a minute) and proposes a plan. Nothing is tested until you approve
          it. {type === 'both' ? 'Both runs together take about 8–10 minutes.' : 'A full run takes about 3–5 minutes.'}
        </p>
        <Button type="submit" size="lg" className="blueprint" disabled={start.isPending}>
          <Corners />
          {start.isPending && <Loader2 className="animate-spin" aria-hidden />}
          Start planning
          <ArrowRight aria-hidden />
        </Button>
      </div>
    </form>
  )
}
