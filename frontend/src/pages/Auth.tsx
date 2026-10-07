import { AlertCircle, Loader2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'

import { useLogin, useMe, useSignup } from '@/api/hooks'
import { Corners } from '@/components/common/Corners'
import { Logo } from '@/components/common/Logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
}) {
  const errorId = `${props.id}-error`
  const hintId = `${props.id}-hint`
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={props.id}>{props.label}</Label>
      <Input
        id={props.id}
        type={props.type ?? 'text'}
        value={props.value}
        autoComplete={props.autoComplete}
        aria-invalid={Boolean(props.error)}
        aria-describedby={props.error ? errorId : props.hint ? hintId : undefined}
        onChange={(e) => props.onChange(e.target.value)}
      />
      {props.error ? (
        <p id={errorId} className="text-[13px] text-v-bug">
          {props.error}
        </p>
      ) : (
        props.hint && (
          <p id={hintId} className="text-xs text-muted-foreground">
            {props.hint}
          </p>
        )
      )}
    </div>
  )
}

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
      aria-current={mode === m ? 'page' : undefined}
      className={cn(
        'flex min-h-10 flex-1 items-center justify-center text-[15px]',
        mode === m ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
        m === 'signup' && 'border-l',
      )}
    >
      {label}
    </Link>
  )

  return (
    <div className="min-h-screen">
      <header className="flex h-16 items-center px-4 sm:px-5">
        <Logo />
      </header>
      <main className="flex justify-center px-4 pt-4 pb-10">
        <div className="blueprint flex w-full max-w-[420px] flex-col gap-[18px] px-6 py-7">
          <Corners />
          <nav aria-label="Log in or sign up" className="flex border">
            {tab('login', 'Log in')}
            {tab('signup', 'Sign up')}
          </nav>
          <div>
            <h1 className="text-[30px]">{isSignup ? 'Create your account' : 'Welcome back'}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {isSignup ? 'Test your first site in a few minutes.' : 'Log in to see your sites and reports.'}
            </p>
          </div>
          {errors.form && (
            <div role="alert" className="flex gap-2 border border-v-bug-bd bg-v-bug-bg px-3 py-2.5 text-sm">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-v-bug" aria-hidden />
              <span>{errors.form}</span>
            </div>
          )}
          <form className="grid gap-3.5" onSubmit={onSubmit} noValidate>
            {isSignup && (
              <Field id="name" label="Name" value={name} onChange={setName} error={errors.name} autoComplete="name" />
            )}
            <Field
              id="email"
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              error={errors.email}
              autoComplete={isSignup ? 'email' : 'username'}
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
            <Button type="submit" size="lg" className="blueprint mt-1" disabled={mutation.isPending}>
              <Corners />
              {mutation.isPending && <Loader2 className="animate-spin" aria-hidden />}
              {isSignup ? 'Create account' : 'Log in'}
            </Button>
          </form>
        </div>
      </main>
    </div>
  )
}

export const Signup = () => <AuthPage mode="signup" />
export const Login = () => <AuthPage mode="login" />
