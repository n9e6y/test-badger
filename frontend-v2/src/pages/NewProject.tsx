import { Loader2 } from 'lucide-react'
import { type FormEvent, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useCreateProject } from '@/api/hooks'
import { OwnShopNote } from '@/components/common/OwnShopNote'
import { Button } from '@/components/ui/button'
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

  const fieldCls = 'h-12 border border-foreground bg-background px-3 text-base aria-invalid:border-2 aria-invalid:border-v-bug'

  return (
    <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-7">
      <nav aria-label="Breadcrumb" className="flex gap-2 text-sm">
        <Link to="/app/sites" className="font-semibold underline-offset-4 hover:underline">
          Sites
        </Link>
        <span aria-hidden>/</span>
        <span>Add site</span>
      </nav>
      <h1 className="text-[clamp(40px,4vw,52px)] leading-[0.95]">Add a site</h1>
      <div className="flex flex-wrap items-start gap-x-12 gap-y-8">
        <form onSubmit={submit} noValidate className="flex min-w-0 flex-[1.6_1_420px] flex-col gap-[22px] border border-foreground p-5 lg:p-6">
          <div className="grid gap-1.5">
            <Label htmlFor="site-name" className="text-[15px] font-semibold">
              Name
            </Label>
            <input
              id="site-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My store (staging)"
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? 'site-name-error' : 'site-name-hint'}
              className={fieldCls}
            />
            {errors.name ? (
              <p id="site-name-error" className="text-[13px] font-medium text-v-bug">
                {errors.name}
              </p>
            ) : (
              <p id="site-name-hint" className="text-[13px]">
                Only you see this.
              </p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="site-url" className="text-[15px] font-semibold">
              URL
            </Label>
            <input
              id="site-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://staging.mystore.com"
              inputMode="url"
              autoComplete="url"
              aria-invalid={Boolean(errors.url)}
              aria-describedby={errors.url ? 'site-url-error' : 'site-url-hint'}
              className={`${fieldCls} font-mono text-[15px]`}
            />
            {errors.url ? (
              <p id="site-url-error" className="text-[13px] font-medium text-v-bug">
                {errors.url}
              </p>
            ) : (
              <p id="site-url-hint" className="text-[13px]">
                {origins.length > 0
                  ? `test-badger only visits: ${origins.join(', ')}`
                  : "test-badger only visits pages on this site's own domain."}
              </p>
            )}
            <OwnShopNote url={url} />
          </div>
          <div className="grid gap-1.5">
            <label className="flex cursor-pointer items-start gap-3 border bg-surface p-3.5">
              <input
                type="checkbox"
                className="mt-px size-[22px] shrink-0 accent-foreground"
                checked={authorized}
                onChange={(e) => setAuthorized(e.target.checked)}
                aria-describedby={errors.authorized ? 'auth-error' : undefined}
              />
              <span className="flex flex-col gap-1">
                <span className="text-base leading-snug font-semibold">I own or am authorized to test this site</span>
                <span className="text-sm leading-snug">
                  test-badger creates test accounts and fills in forms. It never pays and never deletes anything.
                </span>
              </span>
            </label>
            {errors.authorized && (
              <p id="auth-error" className="text-[13px] font-medium text-v-bug">
                {errors.authorized}
              </p>
            )}
          </div>
          {errors.form && (
            <div role="alert" className="flex gap-3 border-2 border-foreground p-3.5 text-sm">
              <span aria-hidden className="grid size-6 shrink-0 place-items-center bg-foreground font-bold text-background">
                !
              </span>
              <span className="self-center">{errors.form}</span>
            </div>
          )}
          <div className="flex flex-wrap gap-2.5">
            <Button type="submit" size="lg" disabled={create.isPending || !authorized}>
              {create.isPending && <Loader2 className="animate-spin" aria-hidden />}
              {create.isPending ? 'Checking the site…' : 'Add site'}
            </Button>
            <Button type="button" variant="ghost" size="lg" onClick={() => navigate(-1)}>
              Cancel
            </Button>
          </div>
        </form>
        <aside className="flex min-w-0 flex-[1_1_260px] flex-col gap-3">
          <p className="kicker page-label font-semibold">Safe by design</p>
          <ul className="flex flex-col border-t border-foreground text-[15px] leading-snug">
            <li className="border-b py-3">Stays on your site’s own domain</li>
            <li className="border-b py-3">Stops at the payment step and never pays</li>
            <li className="border-b py-3">
              Reports <span className="font-semibold text-v-blocked">Blocked</span> at a CAPTCHA instead of breaking in
            </li>
            <li className="border-b py-3">Works within a step and cost budget</li>
          </ul>
        </aside>
      </div>
    </div>
  )
}
