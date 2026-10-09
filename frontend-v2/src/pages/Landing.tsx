import { CircleX } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'

import { useMe } from '@/api/hooks'
import type { Verdict } from '@/api/types'
import { ToneBadge, VerdictBadge } from '@/components/common/badges'
import { GridPanel } from '@/components/common/GridPanel'
import { LogoMark, Wordmark } from '@/components/common/Logo'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { INFO_PAGES } from '@/lib/pages'

// After sign-up the user lands where they meant to go.
const OWN_SITE = { pathname: '/signup', state: { from: '/app/projects/new' } }
const DEMO = { pathname: '/signup', state: { from: '/app' } }
const SOURCE_URL = 'https://github.com/n9e6y/test-badger'

const STEPS = [
  {
    n: '01',
    meta: '~30 s',
    title: 'Plan',
    text: 'It explores your site and proposes a test plan. You switch scenarios on or off, then approve.',
  },
  {
    n: '02',
    meta: '~2–5 min',
    title: 'Watch',
    text: 'It tests in a real browser. You see every click, the reason for it, the time and the cost so far.',
  },
  {
    n: '03',
    meta: '1 click to re-run',
    title: 'Report',
    text: 'One verdict per scenario. Every bug comes with screenshots, errors and exact steps to reproduce.',
  },
]

const STATS: [string, string, string][] = [
  ['9 / 9', '', 'planted bugs found'],
  ['0', '', 'false alarms in 13 runs'],
  ['~4.5', ' min', 'per store test'],
  ['$0.15–0.43', '', 'AI cost per run'],
]

// A real result: Store test on our demo shop with all planted bugs switched on (evaluation round 2).
const SAMPLE_SCENARIOS: [string, string, Verdict][] = [
  ['ST1', 'Add an in-stock product to the cart', 'PASSED'],
  ['ST2', 'Change quantity, including invalid values', 'BUG_FOUND'],
  ['ST3', 'Remove an item from the cart', 'BUG_FOUND'],
  ['ST4', 'Apply a valid and an expired coupon', 'BUG_FOUND'],
  ['ST5', 'Try to buy an out-of-stock product', 'BUG_FOUND'],
  ['ST6', 'Checkout form with missing or invalid fields', 'BUG_FOUND'],
  ['ST7', 'Complete checkout up to the payment step', 'PASSED'],
]

const NAV = [
  { href: '#how', label: 'How it works' },
  { href: '#sample', label: 'Sample report' },
  { href: '#numbers', label: 'Numbers' },
]

function Kicker({ children, onDark }: { children: string; onDark?: boolean }) {
  return <p className={`kicker page-label font-semibold ${onDark ? 'text-background' : ''}`}>{children}</p>
}

export function Landing() {
  const me = useMe()
  if (me.data) return <Navigate to="/app" replace />

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" aria-label="test-badger home" className="inline-flex items-center gap-2.5">
            <LogoMark size={30} />
            <Wordmark className="text-2xl" />
          </Link>
          <div className="hidden items-center gap-10 lg:flex">
            <nav aria-label="Page" className="flex gap-7 text-[15px] font-semibold">
              {NAV.map((n) => (
                <a key={n.href} href={n.href} className="hover:underline">
                  {n.label}
                </a>
              ))}
            </nav>
            <div className="flex gap-2">
              <Link to="/login" className="inline-flex min-h-10 items-center px-3.5 text-[15px] font-semibold hover:underline">
                Log in
              </Link>
              <Link
                to={DEMO.pathname}
                state={DEMO.state}
                className="inline-flex min-h-10 items-center border border-foreground px-4 text-[15px] font-semibold hover:bg-accent"
              >
                Sign up
              </Link>
            </div>
          </div>
          <div className="flex gap-2 lg:hidden">
            <Link to="/login" className="inline-flex min-h-11 items-center border border-foreground px-3.5 text-[15px] font-semibold">
              Log in
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger aria-label="Open menu" className="flex size-11 flex-col items-center justify-center gap-[5px] border">
                <span className="block h-0.5 w-[18px] bg-foreground" />
                <span className="block h-0.5 w-[18px] bg-foreground" />
                <span className="block h-0.5 w-[18px] bg-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-56">
                {NAV.map((n) => (
                  <DropdownMenuItem key={n.href} onSelect={() => window.location.assign(n.href)}>
                    {n.label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                {INFO_PAGES.map((p) => (
                  <DropdownMenuItem key={p.href} onSelect={() => window.location.assign(p.href)}>
                    {p.label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to={DEMO.pathname} state={DEMO.state} className="font-semibold">
                    Sign up
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="border-b bg-background bg-[linear-gradient(rgba(10,10,10,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(10,10,10,0.05)_1px,transparent_1px)] bg-[size:48px_48px]">
          <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-16 gap-y-10 px-4 py-12 sm:px-6 lg:py-20">
            <div className="flex min-w-0 flex-[1.15_1_480px] flex-col gap-[22px]">
              <Kicker>Pre-release QA agent</Kicker>
              <h1 className="text-[clamp(64px,9vw,128px)] leading-[0.84] tracking-[-0.02em]">Find it first.</h1>
              <p className="max-w-[600px] text-[clamp(19px,1.75vw,24px)] leading-snug font-medium text-pretty">
                test-badger tests your signup and checkout in a real browser before every release, and shows you exactly
                what broke.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <Link to={OWN_SITE.pathname} state={OWN_SITE.state}>
                    Test your own site →
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link to={DEMO.pathname} state={DEMO.state}>
                    Try the demo shop
                  </Link>
                </Button>
              </div>
              <p className="text-[15px] leading-normal">No test code to write. Nothing runs until you approve the plan.</p>
            </div>

            <GridPanel as="div" className="min-w-0 flex-[1_1_380px] bg-background bg-none">
              <div className="flex flex-wrap justify-between gap-x-4 gap-y-1.5 border-b border-foreground px-4 py-3.5">
                <span className="text-sm font-semibold">Pine &amp; Pebble (demo) · Store &amp; checkout</span>
                <span className="font-heading text-[17px] font-semibold">4:39 · $0.43</span>
              </div>
              <div className="flex items-center gap-2.5 border-b bg-v-bug-bg px-4 py-3">
                <CircleX className="size-5 shrink-0 stroke-[2.5] text-v-bug" aria-hidden />
                <span className="text-[15px] font-semibold text-v-bug">5 bugs found in 7 scenarios</span>
              </div>
              <ul>
                {SAMPLE_SCENARIOS.map(([id, title, verdict]) => (
                  <li key={id} className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
                    <span className="flex min-w-0 gap-2.5 text-sm leading-snug">
                      <span className="w-7 shrink-0 font-heading text-[15px] font-semibold">{id}</span>
                      <span>{title}</span>
                    </span>
                    <VerdictBadge verdict={verdict} />
                  </li>
                ))}
              </ul>
              <p className="px-4 py-2.5 text-xs font-semibold tracking-[0.14em] uppercase">
                A real run on our demo shop
              </p>
            </GridPanel>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-4 border-b">
          <div className="mx-auto flex max-w-[1240px] flex-col gap-9 px-4 py-14 sm:px-6 lg:py-20">
            <div className="flex flex-col gap-3.5">
              <Kicker>How it works</Kicker>
              <h2 className="text-[clamp(36px,3.8vw,52px)] leading-[0.95]">Three steps. You stay in control.</h2>
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-4">
              {STEPS.map((s, i) => (
                <div
                  key={s.n}
                  className={`flex flex-col gap-3 border border-foreground p-6 ${i === 2 ? 'bg-foreground text-background' : ''}`}
                >
                  <div className="flex items-baseline justify-between">
                    <span className="font-heading text-[56px] leading-[0.85] font-semibold">{s.n}</span>
                    <span className="text-xs font-semibold tracking-[0.14em] uppercase">{s.meta}</span>
                  </div>
                  <h3 className="text-[30px] leading-none">{s.title}</h3>
                  <p className="text-base leading-relaxed">{s.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Sample report */}
        <section id="sample" className="scroll-mt-4 border-b bg-surface">
          <div className="mx-auto flex max-w-[1240px] flex-wrap items-start gap-x-16 gap-y-9 px-4 py-14 sm:px-6 lg:py-20">
            <div className="flex flex-[1_1_320px] flex-col gap-4">
              <Kicker>Sample report</Kicker>
              <h2 className="text-[clamp(36px,3.8vw,52px)] leading-[0.95]">Every bug comes with proof.</h2>
              <p className="text-[17px] leading-relaxed">
                Steps, URLs and errors are filled in from what actually happened in the browser, so a developer can
                reproduce it in a minute.
              </p>
              <div className="flex flex-wrap gap-2">
                <VerdictBadge verdict="PASSED" />
                <VerdictBadge verdict="BUG_FOUND" />
                <VerdictBadge verdict="BLOCKED" />
                <VerdictBadge verdict="INCONCLUSIVE" />
              </div>
            </div>
            <article className="min-w-0 flex-[1.4_1_460px] border border-foreground bg-background">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 border-b px-[18px] py-3.5">
                <ToneBadge tone="bug" label="Bug found" />
                <span className="border border-foreground px-2 py-[3px] text-xs leading-4 font-semibold tracking-[0.05em] uppercase">
                  Severity · Major
                </span>
                <span className="text-[13px] font-semibold">Cart · ST3</span>
              </div>
              <div className="flex flex-col gap-4 p-[18px]">
                <h3 className="text-[26px] leading-[1.05]">The “Remove” button in the cart does nothing</h3>
                <p className="text-[15px] leading-relaxed">
                  <strong className="font-semibold">Expected:</strong> the item leaves the cart and the total updates.{' '}
                  <strong className="font-semibold">Actual:</strong> nothing changes, and the browser console shows a
                  JavaScript error.
                </p>
                <ol className="flex list-decimal flex-col gap-1 pl-[22px] text-[15px] leading-normal">
                  <li>Open /products/ceramic-mug</li>
                  <li>Click “Add to cart”</li>
                  <li>Open /cart</li>
                  <li>Click “Remove” next to “Ceramic Mug”</li>
                </ol>
                <pre className="overflow-x-auto bg-foreground px-3.5 py-3 font-mono text-[13px] leading-normal text-background">
                  Console error after step 4{'\n'}ReferenceError: removeLine is not defined
                </pre>
                <p className="text-xs font-semibold tracking-[0.14em] uppercase">
                  Planted bug B5 on our demo shop, as test-badger reported it
                </p>
              </div>
            </article>
          </div>
        </section>

        {/* Numbers */}
        <section id="numbers" className="scroll-mt-4 bg-foreground text-background">
          <div className="mx-auto flex max-w-[1240px] flex-col gap-8 px-4 py-14 sm:px-6 lg:py-20">
            <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-3">
              <h2 className="text-[clamp(36px,3.8vw,52px)] leading-[0.95]">Honest numbers</h2>
              <p className="max-w-[520px] text-[15px] leading-relaxed">
                Measured on our own demo shop with 9 planted bugs. Results on your site may vary. When the agent is not
                sure, it says so.
              </p>
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] border-t border-background/30">
              {STATS.map(([value, unit, label]) => (
                <div key={label} className="flex flex-col gap-2 pt-[22px] pr-5 pb-1">
                  <span className="font-heading text-[clamp(52px,5vw,72px)] leading-[0.85] font-semibold">
                    {value}
                    {unit && <span className="text-[28px]">{unit}</span>}
                  </span>
                  <span className="text-[15px]">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-4 px-4 py-7 text-sm sm:px-6">
        <span className="inline-flex items-center gap-2">
          <LogoMark size={22} />
          <Wordmark className="text-xl" />
        </span>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2 font-semibold">
          {INFO_PAGES.map((p) => (
            <a key={p.href} href={p.href} className="hover:underline">
              {p.label}
            </a>
          ))}
          <a href={SOURCE_URL} className="hover:underline">
            Source on GitHub
          </a>
          <Link to="/login" className="hover:underline">
            Log in
          </Link>
        </nav>
      </footer>
    </div>
  )
}
