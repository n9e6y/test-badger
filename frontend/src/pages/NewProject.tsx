import { ArrowLeft, Loader2 } from 'lucide-react'
import { type FormEvent, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useCreateProject } from '@/api/hooks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function deriveOrigins(raw: string): string[] {
  try {
    const url = new URL(raw.includes('://') ? raw : `https://${raw}`)
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.')) return []
    const host = url.hostname
    const sibling = host.startsWith('www.') ? host.slice(4) : `www.${host}`
    const port = url.port ? `:${url.port}` : ''
    return [`${url.protocol}//${host}${port}`, ...(url.port ? [] : [`${url.protocol}//${sibling}`])]
  } catch {
    return []
  }
}

export function NewProject() {
  const create = useCreateProject()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [authorized, setAuthorized] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const origins = useMemo(() => deriveOrigins(url.trim()), [url])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const found: Record<string, string> = {}
    if (!name.trim()) found.name = 'Give the site a name.'
    if (origins.length === 0) found.url = 'Enter a full address, e.g. https://staging.mystore.com'
    if (!authorized) found.authorized = 'Please confirm you may test this site.'
    setErrors(found)
    if (Object.keys(found).length) return
    const base = url.includes('://') ? url.trim() : `https://${url.trim()}`
    create.mutate(
      { name: name.trim(), base_url: base, authorized },
      { onSuccess: (p) => navigate(`/app/projects/${p.id}`), onError: (err) => setErrors({ form: err.message }) },
    )
  }

  return (
    <div className="mx-auto grid w-full max-w-xl gap-6">
      <Link to="/app" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Dashboard
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Add a site</h1>
        <p className="text-muted-foreground">We recommend testing a staging copy of your site, not the live one.</p>
      </div>
      <form onSubmit={submit} noValidate className="grid gap-5 rounded-xl border bg-background p-6">
        <div className="grid gap-1.5">
          <Label htmlFor="site-name">Site name</Label>
          <Input id="site-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="My store (staging)"
            aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'site-name-error' : undefined} />
          {errors.name && <p id="site-name-error" className="text-sm text-destructive">{errors.name}</p>}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="site-url">Address</Label>
          <Input id="site-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://staging.mystore.com"
            inputMode="url" autoComplete="url" aria-invalid={Boolean(errors.url)}
            aria-describedby={errors.url ? 'site-url-error' : 'site-url-hint'} />
          {errors.url ? (
            <p id="site-url-error" className="text-sm text-destructive">{errors.url}</p>
          ) : (
            <p id="site-url-hint" className="text-sm text-muted-foreground">
              {origins.length > 0 ? <>The agent will only visit: {origins.join(', ')}</> : 'The agent never leaves this site.'}
            </p>
          )}
        </div>
        <div className="grid gap-1.5">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 size-4 accent-foreground" checked={authorized}
              onChange={(e) => setAuthorized(e.target.checked)} aria-describedby={errors.authorized ? 'auth-error' : undefined} />
            <span>I own this site or I'm authorized to test it.</span>
          </label>
          {errors.authorized && <p id="auth-error" className="text-sm text-destructive">{errors.authorized}</p>}
        </div>
        {errors.form && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{errors.form}</p>}
        <Button type="submit" size="lg" disabled={create.isPending}>
          {create.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {create.isPending ? 'Checking the site…' : 'Save site'}
        </Button>
      </form>
    </div>
  )
}
