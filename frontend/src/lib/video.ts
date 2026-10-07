import type { ScenarioRow } from '@/api/types'

/** True when the run recorded a video for this scenario (D22). */
export const hasVideo = (s: ScenarioRow | undefined): s is ScenarioRow & { video_artifact_id: string } =>
  Boolean(s?.video_artifact_id)
