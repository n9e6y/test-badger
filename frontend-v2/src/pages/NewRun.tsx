import { Layers, Loader2, ShoppingCart, UserPlus } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { toast } from 'sonner'

import { type TestChoice, useMe, useProject, useStartTests } from '@/api/hooks'
import type { RunMode, TestType } from '@/api/types'
import { ErrorState, FullPageSpinner } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { allowedMode, estimate, estimateUsd, MODES, RESERVED_NOTE, RUNS_RESERVED_NOTE } from '@/lib/mode'
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
  disabled = false,
  children,
}: {
  checked: boolean
  onSelect: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-disabled={disabled}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'relative flex min-w-0 flex-col gap-2.5 bg-background px-[18px] pt-[18px] pb-5 text-left disabled:cursor-not-allowed disabled:opacity-55',
        checked ? 'border-2 border-foreground p-[17px] pb-[19px]' : 'border enabled:hover:bg-surface',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'absolute top-[18px] right-[18px] grid size-[22px] place-items-center border-2 border-foreground',
          checked ? 'bg-foreground' : 'bg-background',
        )}
      >
        <span className="size-2 bg-background" />
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
  const me = useMe()
  const [wantedMode, setMode] = useState<RunMode>('thorough')
  const mode = allowedMode(wantedMode, me.data?.modes)
  const runsLeft = me.data?.runs_left_today
  const outOfRuns = runsLeft !== undefined && runsLeft < (type === 'both' ? 2 : 1)
  const [goal, setGoal] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const types: TestType[] = type === 'both' ? ['registration', 'store'] : [type]
  const chosen = estimate(mode, types)
  const budgetLeft = me.data?.budget_left_usd ?? null
  // The API checks each run on its own; for "Both" the first run alone must fit, but warn early.
  const overBudget = budgetLeft !== null && budgetLeft < estimateUsd(mode, types.slice(0, 1))

  if (project.isPending) return <FullPageSpinner />
  if (project.isError) return <ErrorState message={project.error.message} onRetry={() => project.refetch()} />

  const submit = (e: FormEvent) => {
    e.preventDefault()
    start.mutate(
      {
        projectId,
        choice: type,
        input: {
          mode,
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
      <div className="flex flex-col gap-2.5">
        <nav aria-label="Breadcrumb" className="flex flex-wrap gap-2 text-sm">
          <Link to={`/app/projects/${projectId}`} className="font-semibold underline-offset-4 hover:underline">
            {project.data.name}
          </Link>
          <span aria-hidden>/</span>
          <span>New run</span>
        </nav>
        <h1 className="text-[clamp(40px,4vw,52px)] leading-[0.95]">New test run</h1>
        <span className="font-mono text-sm break-all">{project.data.base_url.replace(/^https?:\/\//, '')}</span>
      </div>

      <section className="flex flex-col gap-3">
        <h2 id="type-title" className="flex items-baseline gap-3">
          <span className="font-heading text-lg font-semibold">1</span>
          <span className="text-[28px] leading-none">What should it test?</span>
        </h2>
        <div role="radiogroup" aria-labelledby="type-title" className="grid gap-4 sm:grid-cols-3">
          {TYPES.map(({ key, title, text, icon: Icon }) => (
            <OptionCard key={key} checked={type === key} onSelect={() => setType(key)}>
              <Icon className="size-6 stroke-[1.75]" aria-hidden />
              <span className="pr-8 font-heading text-[26px] leading-none font-semibold">{title}</span>
              <span className="text-[15px] leading-normal text-pretty">{text}</span>
            </OptionCard>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 id="mode-title" className="flex items-baseline gap-3">
          <span className="font-heading text-lg font-semibold">2</span>
          <span className="text-[28px] leading-none">How thorough?</span>
        </h2>
        <div role="radiogroup" aria-labelledby="mode-title" className="grid gap-4 sm:grid-cols-2">
          {(Object.keys(MODES) as RunMode[]).map((key) => {
            const est = estimate(key, types)
            return (
              <OptionCard
                key={key}
                checked={mode === key}
                onSelect={() => setMode(key)}
                disabled={!(me.data?.modes ?? ['quick']).includes(key)}
              >
                <span className="pr-8 font-heading text-[26px] leading-none font-semibold">{MODES[key].label}</span>
                <span className="flex items-baseline gap-2.5">
                  <span className="font-heading text-[30px] leading-none font-semibold">{est.cost}</span>
                  <span className="text-[15px] font-semibold">{est.minutes}</span>
                </span>
                <span className="text-[15px] leading-normal text-pretty">{MODES[key].text}</span>
                {!(me.data?.modes ?? ['quick']).includes(key) && <span className="text-[13px]">{RESERVED_NOTE}</span>}
              </OptionCard>
            )
          })}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="flex items-baseline gap-3">
          <span className="font-heading text-lg font-semibold">3</span>
          <span className="text-[28px] leading-none">Anything specific?</span>
          <span className="font-sans text-sm font-normal">optional</span>
        </h2>
        <div className="flex flex-col gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="goal" className="text-[15px] font-semibold">
              Goal or notes for the agent
            </Label>
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
              className="min-h-[96px] resize-y border border-foreground bg-background p-3 text-base leading-normal placeholder:text-muted-foreground"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="test-email" className="text-[15px] font-semibold">
                Test account email
              </Label>
              <input
                id="test-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="off"
                className="h-12 border border-foreground bg-background px-3 text-base"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="test-password" className="text-[15px] font-semibold">
                Test account password
              </Label>
              <input
                id="test-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="h-12 border border-foreground bg-background px-3 text-base"
              />
            </div>
          </div>
          <p className="text-[13px]">
            Only needed if your site requires a login. The password is stored encrypted and never shown to the AI.
          </p>
        </div>
      </section>

      {start.isError && (
        <div role="alert" className="flex gap-3 border-2 border-foreground p-3.5 text-sm">
          <span aria-hidden className="grid size-6 shrink-0 place-items-center bg-foreground font-bold text-background">
            !
          </span>
          <span className="self-center">{start.error.message}</span>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 border border-foreground bg-surface px-5 py-[18px]">
        <p className="flex flex-[1_1_320px] flex-col gap-1 text-sm text-pretty">
          <span className="font-heading text-2xl leading-none font-semibold">
            {MODES[mode].label} · {TYPES.find((t) => t.key === type)?.title} · {chosen.cost} · {chosen.minutes}
          </span>
          <span>The agent first explores the site (about a minute) and proposes a plan. Nothing runs until you approve it.</span>
          {runsLeft !== undefined && (
            <span className={cn('block', outOfRuns && 'font-semibold text-v-bug')}>
              {me.data?.runs_per_day === 0
                ? RUNS_RESERVED_NOTE
                : outOfRuns
                ? `Not enough test runs left today (${runsLeft} of ${me.data?.runs_per_day}). Please come back tomorrow.`
                : `${runsLeft} of ${me.data?.runs_per_day} test runs left today.`}
            </span>
          )}
          {budgetLeft !== null && (
            <span className={cn('block', overBudget && 'font-semibold text-v-bug')}>
              {overBudget
                ? `The AI budget for this demo is used up ($${budgetLeft.toFixed(2)} left). Please contact the test-badger team.`
                : `AI budget left for this demo: $${budgetLeft.toFixed(2)}.`}
            </span>
          )}
        </p>
        <Button
          type="submit"
          className="min-h-[52px] max-w-[320px] flex-auto px-6 text-[17px]"
          disabled={start.isPending || outOfRuns || overBudget}
        >
          {start.isPending && <Loader2 className="animate-spin" aria-hidden />}
          Build test plan →
        </Button>
      </div>
    </form>
  )
}
