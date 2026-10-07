import { ArrowRight, Eye, FileText, ListChecks, ShoppingCart } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'

import { useMe } from '@/api/hooks'
import type { Verdict } from '@/api/types'
import { ToneBadge, VerdictBadge } from '@/components/common/badges'
import { Corners } from '@/components/common/Corners'
import { Logo, LogoMark, Wordmark } from '@/components/common/Logo'
import { Button } from '@/components/ui/button'
import { SCENARIO_VERDICT } from '@/lib/verdict'

// After sign-up the user lands where they meant to go.
const OWN_SITE = { pathname: '/signup', state: { from: '/app/projects/new' } }
const DEMO = { pathname: '/signup', state: { from: '/app' } }

const STEPS = [
  {
    n: '01',
    icon: ListChecks,
    title: 'Plan',
    text: 'Pick what to test: signup or the store checkout. The agent explores your site and proposes scenarios. Switch off what you don’t need, then approve.',
  },
  {
    n: '02',
    icon: Eye,
    title: 'Watch',
    text: 'It runs each scenario in a real Chromium browser. You see the live screen, every click and keystroke, the elapsed time and the cost so far.',
  },
  {
    n: '03',
    icon: FileText,
    title: 'Report',
    text: 'Every scenario gets a verdict. Every bug gets screenshots, console and network errors, and steps to reproduce.',
  },
]

const STATS = [
  ['9/9', 'planted bugs found'],
  ['0', 'false alarms in 13 runs'],
  ['~4.5 min', 'for a full store test'],
  ['$0.15–0.43', 'AI cost per run'],
]

// A real result: Store test on our demo shop with all planted bugs switched on.
const SAMPLE_SCENARIOS: [string, Verdict][] = [
  ['Add an in-stock product to the cart', 'PASSED'],
  ['Change quantity, including invalid values', 'BUG_FOUND'],
  ['Remove an item from the cart', 'BUG_FOUND'],
  ['Apply a valid and an expired coupon', 'BUG_FOUND'],
  ['Try to buy an out-of-stock product', 'BUG_FOUND'],
  ['Checkout form with missing or invalid fields', 'BUG_FOUND'],
  ['Complete checkout up to the payment step', 'PASSED'],
]

function PrimaryCta({ size = 'lg' }: { size?: 'lg' | 'default' }) {
  return (
    <Button asChild size={size} className="blueprint">
      <Link to={OWN_SITE.pathname} state={OWN_SITE.state}>
        <Corners />
        Test your own site
        <ArrowRight aria-hidden />
      </Link>
    </Button>
  )
}

export function Landing() {
  const me = useMe()
  if (me.data) return <Navigate to="/app" replace />

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-5 px-4 sm:px-5">
          <div className="mr-auto">
            <Logo />
          </div>
          <nav aria-label="Page" className="hidden items-center gap-5 text-[15px] md:flex">
            <a href="#how" className="hover:text-steel-700">How it works</a>
            <a href="#sample" className="hover:text-steel-700">Sample report</a>
          </nav>
          <Button variant="ghost" asChild>
            <Link to="/login">Log in</Link>
          </Button>
          <div className="hidden sm:block">
            <PrimaryCta size="default" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-4 sm:px-5">
        {/* Hero */}
        <section className="grid items-center gap-x-14 gap-y-10 pt-10 pb-14 lg:grid-cols-2 lg:pt-14">
          <div className="flex min-w-0 flex-col gap-[18px]">
            <p className="kicker">AI agent for pre-release testing</p>
            <h1 className="text-[clamp(40px,5vw,66px)] leading-[1.02] text-balance">
              Test your signup and checkout before every release.
            </h1>
            <p className="max-w-[32em] text-lg leading-normal text-pretty">
              Give test-badger your website and a goal. It explores the site, proposes a test plan, tests it in a real
              browser while you watch, and reports every bug with screenshots and exact steps to reproduce.
            </p>
            <div className="mt-1.5 flex flex-wrap gap-3">
              <PrimaryCta />
              <Button asChild size="lg" variant="outline">
                <Link to={DEMO.pathname} state={DEMO.state}>
                  <ShoppingCart aria-hidden />
                  Try the demo shop
                </Link>
              </Button>
            </div>
            <p className="text-[13px] text-muted-foreground">
              Nothing to install. You approve the plan before anything is tested.
            </p>
          </div>

          <div className="blueprint min-w-0">
            <Corners />
            <div className="flex justify-between gap-3 border-b px-[18px] py-3 text-[11px] font-medium tracking-[0.1em] uppercase">
              <span>Benchmark · demo shop</span>
              <span className="text-muted-foreground">Oct 2026</span>
            </div>
            <dl className="grid grid-cols-2">
              {STATS.map(([value, label], i) => (
                <div key={label} className={`px-[18px] py-5 ${i % 2 === 0 ? 'border-r' : ''} ${i < 2 ? 'border-b' : ''}`}>
                  <dd className="font-heading text-[clamp(32px,4vw,52px)] leading-none font-semibold">{value}</dd>
                  <dt className="mt-1.5 text-sm">{label}</dt>
                </div>
              ))}
            </dl>
            <p className="border-t px-[18px] py-3 text-[13px] text-pretty text-muted-foreground">
              Our demo shop has 9 deliberately planted bugs in signup, cart and checkout. Results on your site will
              differ.
            </p>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="flex scroll-mt-4 flex-col gap-6 border-t py-12">
          <h2 className="text-[clamp(28px,3vw,36px)]">How it works</h2>
          <div className="grid gap-6 md:grid-cols-3">
            {STEPS.map(({ n, icon: Icon, title, text }) => (
              <div key={n} className="blueprint flex flex-col gap-2.5 p-[22px]">
                <Corners />
                <div className="flex items-center justify-between text-steel-700">
                  <span className="font-heading text-[15px] font-semibold">{n}</span>
                  <Icon className="size-6 stroke-[1.5]" aria-hidden />
                </div>
                <h3 className="text-2xl">{title}</h3>
                <p className="text-pretty">{text}</p>
                {n === '03' && (
                  <div className="flex flex-wrap gap-1.5">
                    {(['PASSED', 'BUG_FOUND', 'BLOCKED', 'INCONCLUSIVE'] as Verdict[]).map((v) => (
                      <VerdictBadge key={v} verdict={v} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Sample report */}
        <section id="sample" className="flex scroll-mt-4 flex-col gap-6 border-t py-12">
          <h2 className="text-[clamp(28px,3vw,36px)]">From a real report</h2>
          <div className="blueprint grid lg:grid-cols-2">
            <Corners />
            <div className="flex min-w-0 flex-col gap-3.5 border-b p-[22px] lg:border-r lg:border-b-0">
              <div className="flex flex-wrap items-center gap-2.5 border border-v-bug-bd bg-v-bug-bg px-3.5 py-3">
                <strong className="font-heading text-xl font-semibold text-v-bug">Bugs found</strong>
                <span className="text-sm">5 bugs in 7 scenarios · Store test · demo shop</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="border border-foreground px-2 py-0.5 text-xs font-semibold">Major</span>
                <span className="text-[13px] text-muted-foreground">Scenario ST3 · Remove an item from the cart</span>
              </div>
              <h3 className="text-[22px] text-pretty">The “Remove” button in the cart does nothing</h3>
              <ol className="grid list-decimal gap-0.5 pl-5 text-sm">
                <li>Open a product page and click “Add to cart”</li>
                <li>Open the cart</li>
                <li>Click “Remove” next to the item: nothing happens, the total stays the same</li>
              </ol>
              <pre className="border px-3 py-2.5 font-mono text-[12.5px] break-words whitespace-pre-wrap text-v-bug">
                Uncaught ReferenceError: removeLine is not defined
              </pre>
            </div>
            <div className="flex min-w-0 flex-col p-[22px]">
              <p className="kicker mb-2">All scenarios</p>
              <ul>
                {SAMPLE_SCENARIOS.map(([title, v]) => (
                  <li
                    key={title}
                    className="flex items-center gap-2.5 border-b border-[color-mix(in_srgb,var(--foreground)_8%,transparent)] py-2 text-sm"
                  >
                    <span className="min-w-0 flex-1">{title}</span>
                    <ToneBadge tone={SCENARIO_VERDICT[v].tone} label={SCENARIO_VERDICT[v].label} />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-4 border-t pt-7 pb-10 text-sm">
          <span className="inline-flex items-center gap-2">
            <LogoMark size={20} />
            <Wordmark className="text-lg" />
          </span>
          <span className="text-muted-foreground">Only test sites you own or are authorized to test.</span>
        </footer>
      </main>
    </div>
  )
}
