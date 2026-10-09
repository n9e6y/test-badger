import { Check, Loader2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'

import { useLogin, useMe, useSignup } from '@/api/hooks'
import { LogoMark, Wordmark } from '@/components/common/Logo'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

type Mode = 'signup' | 'login'
type Errors = Partial<Record<'name' | 'email' | 'password' | 'form', string>>

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validate(mode: Mode, v: { name: string; email: string; password: string }): Errors {
  const errors: Errors = {}
  if (mode === 'signup' && !v.name.trim()) errors.name = 'Enter your name.'
  if (!EMAIL_RE.test(v.email)) errors.email = 'Enter a valid email address.'
  if (mode === 'signup' && v.password.length < 8) errors.password = 'Use at least 8 characters.'
  if (mode === 'login' && !v.password) errors.password = 'Enter your password.'
  return errors
}

function Field(props: {
  id: string
  label: string
  type?: string
  value: string
  onChange: (v: string) => void
  error?: string
  hint?: string
  autoComplete: string
  placeholder?: string
}) {
  const errorId = `${props.id}-error`
  const hintId = `${props.id}-hint`
  const isPassword = props.type === 'password'
  const [shown, setShown] = useState(false)
  return (
    <div className="grid gap-1.5">
      <div className="flex justify-between">
        <Label htmlFor={props.id} className="text-sm font-semibold">
          {props.label}
        </Label>
        {isPassword && (
          <button type="button" onClick={() => setShown((v) => !v)} className="text-sm font-medium underline-offset-4 hover:underline">
            {shown ? 'Hide' : 'Show'}
          </button>
        )}
      </div>
      <input
        id={props.id}
        type={isPassword && shown ? 'text' : (props.type ?? 'text')}
        value={props.value}
        placeholder={props.placeholder}
        autoComplete={props.autoComplete}
        aria-invalid={Boolean(props.error)}
        aria-describedby={props.error ? errorId : props.hint ? hintId : undefined}
        onChange={(e) => props.onChange(e.target.value)}
        className="h-12 border border-foreground bg-background px-3 text-base outline-offset-2 aria-invalid:border-2 aria-invalid:border-v-bug"
      />
      {props.error ? (
        <p id={errorId} className="text-[13px] font-medium text-v-bug">
          {props.error}
        </p>
      ) : (
        props.hint && (
          <p id={hintId} className="text-[13px]">
            {props.hint}
          </p>
        )
      )}
    </div>
  )
}

const PROMISES = ['Nothing runs until you approve the plan', 'Never makes a real payment', 'Every bug comes with evidence']

function AuthPage({ mode }: { mode: Mode }) {
  const me = useMe()
  const signup = useSignup()
  const login = useLogin()
  const navigate = useNavigate()
  const location = useLocation()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Errors>({})

  const mutation = mode === 'signup' ? signup : login
  const from = (location.state as { from?: string } | null)?.from ?? '/app'

  if (me.data) return <Navigate to={from} replace />

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const found = validate(mode, { name, email, password })
    setErrors(found)
    if (Object.keys(found).length > 0) return
    const onSuccess = () => navigate(from, { replace: true })
    const onError = (err: Error) => setErrors({ form: err.message })
    if (mode === 'signup') signup.mutate({ name, email, password }, { onSuccess, onError })
    else login.mutate({ email, password }, { onSuccess, onError })
  }

  const isSignup = mode === 'signup'
  const tab = (m: Mode, label: string) => (
    <Link
      to={m === 'login' ? '/login' : '/signup'}
      state={location.state}
      replace
      role="tab"
      aria-selected={mode === m}
      className={cn(
        'flex min-h-11 flex-1 items-center justify-center text-[15px] font-semibold',
        mode === m ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
        m === 'signup' && 'border-l border-foreground',
      )}
    >
      {label}
    </Link>
  )

  return (
    <div className="flex min-h-screen">
      <aside className="hidden flex-1 flex-col justify-between gap-10 border-r border-foreground bg-surface bg-[linear-gradient(rgba(10,10,10,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(10,10,10,0.06)_1px,transparent_1px)] bg-[size:40px_40px] p-12 lg:flex">
        <Link to="/" aria-label="test-badger home" className="inline-flex items-center gap-2.5">
          <LogoMark size={32} />
          <Wordmark className="text-[26px]" />
        </Link>
        <div className="flex flex-col gap-6">
          <p className="font-heading text-[clamp(72px,8vw,112px)] leading-[0.84] font-bold tracking-[-0.02em]">Find it first.</p>
          <ul className="flex flex-col border-t border-foreground">
            {PROMISES.map((t) => (
              <li key={t} className="flex items-center gap-3 border-b py-3 text-[17px]">
                <Check className="size-[18px] shrink-0 stroke-[2.75]" aria-hidden />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <span className="text-[13px] font-semibold tracking-[0.14em] uppercase">Pre-release QA agent</span>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col items-center justify-center px-4 py-10 sm:px-6">
        <div className="flex w-full max-w-[420px] flex-col gap-6">
          <Link to="/" aria-label="test-badger home" className="inline-flex items-center gap-2.5 lg:hidden">
            <LogoMark size={32} />
            <Wordmark className="text-[26px]" />
          </Link>
          <nav role="tablist" aria-label="Account" className="grid grid-cols-2 border border-foreground">
            {tab('login', 'Log in')}
            {tab('signup', 'Sign up')}
          </nav>
          <form className="flex flex-col gap-[18px]" onSubmit={onSubmit} noValidate>
            <h1 className="text-[40px] leading-none font-semibold">{isSignup ? 'Create your account' : 'Welcome back'}</h1>
            {errors.form && (
              <div role="alert" className="flex gap-3 border-2 border-foreground p-3.5 text-sm">
                <span aria-hidden className="grid size-6 shrink-0 place-items-center bg-foreground font-bold text-background">
                  !
                </span>
                <span className="self-center">{errors.form}</span>
              </div>
            )}
            {isSignup && (
              <Field id="name" label="Name" value={name} onChange={setName} error={errors.name} autoComplete="name" placeholder="Anna Becker" />
            )}
            <Field
              id="email"
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              error={errors.email}
              autoComplete={isSignup ? 'email' : 'username'}
              placeholder="anna@example.com"
            />
            <Field
              id="password"
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              error={errors.password}
              hint={isSignup ? 'At least 8 characters.' : undefined}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
            />
            <Button type="submit" className="min-h-[52px] text-[17px]" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="animate-spin" aria-hidden />}
              {isSignup ? 'Create account' : 'Log in'}
            </Button>
            <p className="text-[15px]">
              {isSignup ? 'Already have an account? ' : 'No account yet? '}
              <Link
                to={isSignup ? '/login' : '/signup'}
                state={location.state}
                replace
                className="font-semibold underline underline-offset-4"
              >
                {isSignup ? 'Log in' : 'Sign up'}
              </Link>
            </p>
          </form>
        </div>
      </main>
    </div>
  )
}

export const Signup = () => <AuthPage mode="signup" />
export const Login = () => <AuthPage mode="login" />
