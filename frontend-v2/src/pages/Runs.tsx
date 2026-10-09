import { useAllRuns } from '@/api/hooks'
import { RunsTable } from '@/components/common/RunsTable'
import { EmptyState, ErrorState, SkeletonBlock } from '@/components/common/states'

/** Every run of the account, newest first (new-app app bar "Runs"). */
export function Runs() {
  const runs = useAllRuns()
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[clamp(40px,4vw,52px)] leading-[0.95]">Runs</h1>
        <p className="text-base">Your test runs, newest first. Open one to see its plan, live view or report.</p>
      </div>
      {runs.isError ? (
        <ErrorState message={runs.error.message} onRetry={() => runs.refetch()} />
      ) : runs.isPending ? (
        <SkeletonBlock label="Loading your runs…" />
      ) : runs.data.length === 0 ? (
        <EmptyState title="No runs yet">Start a test from the dashboard. Its report will show up here.</EmptyState>
      ) : (
        <RunsTable runs={runs.data} label="All runs" />
      )}
    </div>
  )
}
