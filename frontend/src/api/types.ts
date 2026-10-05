// Mirrors backend Pydantic schemas (backend/app/schemas, backend/agent/models.py). Keep in sync.

export interface User {
  id: string
  email: string
  name: string
}

export interface SignupInput {
  name: string
  email: string
  password: string
}

export interface LoginInput {
  email: string
  password: string
}

export type TestType = 'registration' | 'store'
export type RunStatus =
  | 'QUEUED'
  | 'RECON'
  | 'PLANNING'
  | 'AWAITING_APPROVAL'
  | 'RUNNING'
  | 'TRIAGING'
  | 'REPORTING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
export type Verdict = 'PASSED' | 'BUG_FOUND' | 'BLOCKED' | 'INCONCLUSIVE'
export type OverallVerdict = 'critical' | 'problems' | 'minor' | 'all_passed' | 'not_testable'

export interface RunSummary {
  id: string
  project_id: string
  project_name: string
  test_type: TestType
  status: RunStatus
  overall_verdict: OverallVerdict | null
  findings_count: number
  cost_usd: number
  created_at: string
}

export interface Project {
  id: string
  name: string
  base_url: string
  allowed_origins: string[]
  is_demo: boolean
  created_at: string
  last_run: RunSummary | null
}

export interface ProjectDetail extends Project {
  runs: RunSummary[]
}

export interface PlanScenario {
  id: string
  title: string
  kind: 'happy_path' | 'negative' | 'edge_case'
  start_url: string
  steps_intent: string[]
  test_data: { key: string; value: string }[]
  expected_result: string
  enabled: boolean
}

export interface TestPlan {
  summary: string
  scenarios: PlanScenario[]
  estimated_minutes: number
}

export interface ScenarioRow {
  id: string
  code: string
  title: string
  kind: string
  order: number
  expected_result: string
  enabled: boolean
  verdict: Verdict | null
  reason: string | null
  steps_taken: number
  duration_s: number
}

export interface ReproStep {
  order: number
  action: string
  url: string
}

export interface Finding {
  id: string
  scenario_id: string
  area: string
  severity: 'critical' | 'major' | 'minor'
  title: string
  owner_summary: string
  expected: string
  actual: string
  repro_steps: ReproStep[]
  evidence: {
    screenshot_ids: string[]
    console_errors: string[]
    failed_requests: string[]
    page_url: string
  }
  confidence: 'high' | 'medium' | 'low'
  confirmed: boolean
  fingerprint: string
}

export interface Report {
  run_id: string
  site_url: string
  test_type: string
  created_at: string
  overall_verdict: OverallVerdict
  headline: string
  coverage_note: string | null
  counts: Record<string, number>
  findings: Finding[]
  needs_review: Finding[]
  scenarios: {
    id: string
    title: string
    verdict: Verdict
    reason: string
    steps_taken: number
    duration_s: number
  }[]
  blocked: { scenario_id: string; reason: string; how_to_unblock: string }[]
  stats: {
    duration_s: number
    llm_calls: number
    tokens_in: number
    tokens_out: number
    cost_usd: number
    limits_hit: string[]
  }
}

export interface Run {
  id: string
  project_id: string
  project_name: string
  site_url: string
  test_type: TestType
  goal_text: string | null
  status: RunStatus
  status_message: string
  error_message: string | null
  plan: TestPlan | null
  scenarios: ScenarioRow[]
  report: Report | null
  cost_usd: number
  tokens_in: number
  tokens_out: number
  created_at: string
  started_at: string | null
  finished_at: string | null
}

export interface StartRunInput {
  test_type: TestType
  goal_text?: string
  test_email?: string
  test_password?: string
}

export interface Step {
  index: number
  action: string
  description: string
  target_label: string | null
  reasoning: string | null
  result: string | null
  url: string | null
  screenshot_artifact_id: string | null
  console_json: string[]
  network_json: string[]
  created_at: string
}
