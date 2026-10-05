import { Loader2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'

import { useLogin, useMe, useSignup } from '@/api/hooks'
import { Logo } from '@/components/common/Logo'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Mode = 'signup' | 'login'
type Errors = Partial<Record<'name' | 'email' | 'password' | 'form', string>>

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validate(mode: Mode, v: { name: string; email: string; password: string }): Errors {
  const errors: Errors = {}
  if (mode === 'signup' && !v.name.trim()) errors.name = 'Enter your name.'
  if (!EMAIL_RE.test(v.email)) errors.email = 'Enter a valid email address.'
  if (mode === 'signup' && v.password.length < 8)
    errors.password = 'Use at least 8 characters.'
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
  autoComplete: string
}) {
  const errorId = `${props.id}-error`
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={props.id}>{props.label}</Label>
      <Input
        id={props.id}
        type={props.type ?? 'text'}
        value={props.value}
        autoComplete={props.autoComplete}
        aria-invalid={Boolean(props.error)}
        aria-describedby={props.error ? errorId : undefined}
        onChange={(e) => props.onChange(e.target.value)}
      />
      {props.error && (
        <p id={errorId} className="text-sm text-destructive">
          {props.error}
        </p>
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
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/30 px-4">
      <Logo />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{isSignup ? 'Create your account' : 'Log in'}</CardTitle>
          <CardDescription>
            {isSignup
              ? 'Test your first site in a few minutes.'
              : 'Welcome back. Log in to see your tests.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={onSubmit} noValidate>
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
              autoComplete="email"
            />
            <Field
              id="password"
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              error={errors.password}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
            />
            {errors.form && (
              <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {errors.form}
              </p>
            )}
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {isSignup ? 'Create account' : 'Log in'}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {isSignup ? 'Already have an account? ' : 'New here? '}
            <Link
              to={isSignup ? '/login' : '/signup'}
              state={location.state}
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              {isSignup ? 'Log in' : 'Create an account'}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

export const Signup = () => <AuthPage mode="signup" />
export const Login = () => <AuthPage mode="login" />
