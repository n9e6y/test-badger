import { AlertCircle, ArrowLeft, Loader2 } from 'lucide-react'
import { type FormEvent, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useCreateProject } from '@/api/hooks'
import { Corners } from '@/components/common/Corners'
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
      {
        // Next step is choosing what to test.
        onSuccess: (p) => navigate(`/app/projects/${p.id}/runs/new`),
        onError: (err) => setErrors({ form: err.message }),
      },
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-[600px] flex-col gap-5">
      <Button variant="ghost" asChild className="-ml-3.5 w-fit">
        <Link to="/app">
          <ArrowLeft aria-hidden /> Dashboard
        </Link>
      </Button>
      <div>
        <h1 className="text-[clamp(30px,3vw,40px)]">Add a site</h1>
        <p className="mt-1 text-muted-foreground">
          Next you’ll pick what to test. A staging copy of your site is the best target.
        </p>
      </div>
      <form onSubmit={submit} noValidate className="blueprint flex flex-col gap-[18px] p-6">
        <Corners />
        <div className="grid gap-1.5">
          <Label htmlFor="site-name">Site name</Label>
          <Input
            id="site-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My store (staging)"
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? 'site-name-error' : undefined}
          />
          {errors.name && (
            <p id="site-name-error" className="text-[13px] text-v-bug">
              {errors.name}
            </p>
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="site-url">URL</Label>
          <Input
            id="site-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://staging.mystore.com"
            inputMode="url"
            autoComplete="url"
            aria-invalid={Boolean(errors.url)}
            aria-describedby={errors.url ? 'site-url-error' : 'site-url-hint'}
          />
          {errors.url ? (
            <p id="site-url-error" className="text-[13px] text-v-bug">
              {errors.url}
            </p>
          ) : (
            <p id="site-url-hint" className="text-xs text-muted-foreground">
              {origins.length > 0 ? <>The agent will only visit: {origins.join(', ')}</> : 'The agent never leaves this site.'}
            </p>
          )}
        </div>
        <div className="grid gap-1.5">
          <label className="flex cursor-pointer items-start gap-2.5 border px-3.5 py-3">
            <input
              type="checkbox"
              className="mt-0.5 size-[18px] shrink-0 accent-primary"
              checked={authorized}
              onChange={(e) => setAuthorized(e.target.checked)}
              aria-describedby={errors.authorized ? 'auth-error' : undefined}
            />
            <span>
              <span className="block font-medium">I own or am authorized to test this site</span>
              <span className="block text-[13px] text-muted-foreground">
                test-badger fills in forms, creates test accounts and goes through checkout up to payment.
              </span>
            </span>
          </label>
          {errors.authorized && (
            <p id="auth-error" className="text-[13px] text-v-bug">
              {errors.authorized}
            </p>
          )}
        </div>
        {errors.form && (
          <div role="alert" className="flex gap-2 border border-v-bug-bd bg-v-bug-bg px-3 py-2.5 text-sm">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-v-bug" aria-hidden />
            <span>{errors.form}</span>
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-2.5">
          <Button type="button" variant="outline" size="lg" onClick={() => navigate('/app')}>
            Cancel
          </Button>
          <Button type="submit" size="lg" className="blueprint" disabled={create.isPending}>
            <Corners />
            {create.isPending && <Loader2 className="animate-spin" aria-hidden />}
            {create.isPending ? 'Checking the site…' : 'Save and continue'}
          </Button>
        </div>
      </form>
    </div>
  )
}
