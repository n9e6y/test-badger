# test-badger

**An AI agent that tests your website's critical flows before you release.**
Give it your site and a goal, approve its test plan, watch it test in a real browser, and get a bug report with screenshots, console and network errors, and exact steps to reproduce.

**Live demo:** the link is in our competition submission. You can also run the whole stack yourself (see [Run it yourself](#run-it-yourself)).

Built for buildX, problem #4 "Web Workflow Tester".

---

## What it does

1. **Add a site.** Enter a URL and confirm you own it or are authorized to test it.
2. **Pick a test type and a mode.** *Registration* (signup with valid and invalid data, duplicate accounts, login), *Store & checkout* (cart, quantities, coupons, stock, checkout up to the payment step), or both. **Hard** mode lets the strongest model drive the browser; **Easy** uses a lighter model for about half the cost.
3. **Approve the plan.** The agent explores the site, proposes test scenarios, and waits for you. You can switch scenarios off. Nothing is tested before you approve.
4. **Watch it test.** Each scenario runs in a real Chromium browser. You see the live screenshot, every action the agent takes and why, the elapsed time and the AI cost so far.
5. **Read the report.** Every scenario gets one of four verdicts: **Passed**, **Bug found**, **Blocked** (e.g. CAPTCHA) or **Inconclusive**. Every bug comes with screenshots, console and network errors, and steps to reproduce. You can copy a finding as Markdown or print the report as a PDF.
6. **Watch it happen.** Every scenario is recorded on video; "Watch video" on a bug plays exactly the part where it happened.
7. **Check your fix.** After fixing, click **Re-run same plan**: the same scenarios run again without new planning, and the report shows per scenario what is **fixed**, **still broken** or **new**.

## Results on our benchmark

Our demo shop has 9 deliberately planted bugs in signup, cart and checkout (for example, the "Remove" button in the cart does nothing).

| Metric | Result |
|---|---|
| Planted bugs found | **9 / 9** |
| False findings | **0** in 13 evaluation runs (including runs on a bug-free version of the shop) |
| Run time | Registration ~2.5 min, Store ~4.5 min (+ ~30 s planning) |
| AI cost per run | **Hard:** Registration ~$0.29, Store ~$0.43 (Claude Sonnet drives the browser) · **Easy:** ~$0.15 / $0.26 (Gemini Flash; found 8/9 in its evaluation pair) |
| Bot protection | A CAPTCHA on the entry page ends as a clear *Blocked* verdict with advice, at zero AI cost |

The agent prefers *Inconclusive* over a weak *Bug found*. Across all runs, every miss surfaced as Inconclusive with a reason, never as a false Passed.

## For judges

Log in on the live site with the judge account from our submission (or sign up with any email; new accounts get Easy mode). Then test any site you like:

- **Your own choice of site:** click **Test your own site**, add the URL, pick a test type and a mode, approve the plan and watch it run. If a checkout needs a login, give a test account in the run form. Sites behind CAPTCHA or bot protection are reported as *Blocked*, not bypassed. Where the agent cannot finish a check, it marks it *Inconclusive* and says why, instead of guessing.
- **Optional: our demo shop.** If you want a site where the right answers are known, the first card on the dashboard runs a test on our demo shop (Registration ~3 min, Store ~5 min). Its 9 planted bugs, which scenario finds each one, and the popups that must *not* be reported are listed in [docs/demo-shop-answer-key.md](docs/demo-shop-answer-key.md), so you can check the report yourself. The demo card tells the agent the shop's coupon codes, as an owner would tell a human tester.

On any report, **Watch video** on a scenario shows exactly what the agent did.

## How to try it

1. Open the live site (link in the submission) and **sign up** (name, email, password).
2. On the dashboard, start a test on the **Demo shop** (Registration, Store, or both), or click **Test your own site** and add a URL you are allowed to test.
3. Approve the plan, watch the run, read the report. Past runs are listed under *Recent runs* and on each site's history page.

Each account can start a limited number of runs per day, because every test costs real AI credit. On the public demo, new accounts use **Easy** mode; **Hard** mode is enabled for the judges' account (configurable, see `JUDGE_EMAIL` / `PUBLIC_MODES`).

---

## How it works

```
Browser (React)  ──HTTPS──  Caddy  ──/api──  FastAPI (API)  ──jobs──  Redis  ──  Worker (agent + Playwright/Chromium)
                                                │                                         │
                                            PostgreSQL  ◄─────── runs, steps, findings ───┘
                                                                  screenshots on a volume
```

**Agent pipeline** (in the worker, `backend/agent/`):

| Stage | What happens |
|---|---|
| Recon | Opens the site, finds the relevant pages (signup, cart, checkout…) |
| Planner | Writes a test plan from the test-type template and what recon found → user approval |
| Executor | Runs each scenario step by step: reads a page snapshot (and a screenshot when needed), picks one tool call (click, type, navigate…), observes the result |
| Triage | Verifies suspected bugs with a second model call, drops duplicates, marks unsure ones as *Needs review* |
| Reporter | Writes the plain-language summary. Repro steps, URLs and errors are filled in by code from the recorded steps, not by the model |

**Design rules**

- **The LLM decides, the code enforces.** The origin allowlist, private-network (SSRF) block, payment and destructive-action guards, and step/cost budgets are enforced in code (`agent/browser/guards.py`), not just in prompts.
- **Every LLM output is a validated Pydantic model**, with one retry on invalid output.
- **Secrets never reach the model.** Test credentials are placeholders swapped in by the tool layer, and password fields are masked in screenshots.
- **Evidence comes from recordings.** Screenshots, console and network errors are captured by Playwright and attached by code.
- **Generic core, pluggable flows.** Each test type is one template file in `agent/templates/`. Adding a new flow (login, contact form, booking) needs no core changes.
- **One multi-provider LLM client** (Anthropic, OpenAI, or any OpenAI-compatible endpoint such as OpenRouter), with the model chosen per role and token cost recorded for every call. No local models.

## Tech stack

- **Backend:** Python 3.12, FastAPI, SQLAlchemy 2 (async), Alembic, Pydantic v2, arq (Redis job queue)
- **Agent:** Playwright (Chromium, headless), hosted LLMs with tool calling and vision
- **Frontend:** React, Vite, TypeScript, TanStack Query, Tailwind CSS, shadcn/ui
- **Data:** PostgreSQL 16, Redis 7
- **Infra:** Docker Compose, Caddy (automatic HTTPS), one VPS
- **Demo shop:** a separate FastAPI + Jinja2 + SQLite app with switchable planted bugs

## Repository layout

```
backend/     FastAPI app (app/), agent (agent/), worker.py, Alembic migrations, tests
frontend/    React app
demo-shop/   Test target with planted bugs B1–B9 (the bugs are intentional; don't fix them)
infra/       docker-compose.yml, Caddyfile, .env.example
```

## Run it yourself

Requirements: Docker with Compose, and an API key for a hosted LLM (OpenRouter, Anthropic or OpenAI).

```bash
cp infra/.env.example infra/.env
# Fill in infra/.env: secrets (the file shows how to generate them), LLM keys and model roles,
# and the sites (local: APP_SITE=http://localhost, SHOP_SITE=http://shop.localhost)

docker compose -f infra/docker-compose.yml up -d --build
```

The API applies database migrations on start. Then open http://localhost (app) and http://shop.localhost (demo shop).

Models are set per role in `.env`, as `<provider>:<model>`:

```
LLM_PLANNER=openai_compat:anthropic/claude-sonnet-5.5
LLM_EXECUTOR=openai_compat:anthropic/claude-sonnet-5.5
LLM_VERIFIER=openai_compat:anthropic/claude-sonnet-5.5
LLM_REPORTER=openai_compat:anthropic/claude-haiku-4.5
LLM_EXECUTOR_QUICK=openai_compat:google/gemini-3.8-flash   # executor for Easy mode
```

Budgets (`RUN_COST_CAP_USD`, `MAX_CONCURRENT_RUNS`, `RUNS_PER_USER_PER_DAY`) and video recording (`VIDEO_ENABLED`) are also set in `.env`.

### Development

```bash
# backend
cd backend && uv sync && uv run pytest -q && uv run ruff check .

# demo shop (admin page: /__admin?token=<SHOP_ADMIN_TOKEN>)
cd demo-shop && uv sync && uv run uvicorn shop.main:app --port 8100 --reload

# frontend (proxies /api to localhost:8000)
cd frontend && npm install && npm run dev
```

Agent tests use a fake LLM client, so the test suite never calls a real model.

## Safety and scope

- Only test sites you own or are authorized to test. The agent stays on the site's own origins and refuses private or internal network addresses.
- It never submits real payments: checkout stops at the payment step.
- Sites behind bot protection (CAPTCHA, WAF) are reported as *Blocked* with advice on how to allow the tester, not bypassed.
- Browser-based testing only: no API, mobile app or CI testing in this version.
