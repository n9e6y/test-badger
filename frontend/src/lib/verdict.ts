// The only place verdict colors are defined (02 §4, 06 §2.1). Don't reuse these colors elsewhere.

export type OverallVerdict = 'critical' | 'problems' | 'minor' | 'all_passed' | 'not_testable'

export const VERDICT_STYLES: Record<OverallVerdict, { label: string; className: string }> = {
  critical: { label: 'Critical', className: 'bg-red-100 text-red-800 border-red-200' },
  problems: { label: 'Problems', className: 'bg-orange-100 text-orange-800 border-orange-200' },
  minor: { label: 'Minor', className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  all_passed: { label: 'All passed', className: 'bg-green-100 text-green-800 border-green-200' },
  not_testable: { label: 'Not testable', className: 'bg-gray-100 text-gray-700 border-gray-200' },
}
