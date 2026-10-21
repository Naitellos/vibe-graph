import type {
  BlastRadiusResult,
  ContextPack,
  Evidence,
  Finding,
  FindingDomain,
  FindingStatus,
  Severity,
  Snapshot,
  Edge as VgEdge,
  Node as VgNode,
} from '@codearch/core'
import useSWR, { type SWRConfiguration, type SWRResponse } from 'swr'

// ─── Response envelope types ──────────────────────────────────────────────────

export type OverviewResponse = {
  project: { name: string; root: string; snapshotBuiltAt: string; snapshotScanId: string }
  counts: {
    subsystems: number
    files: number
    edges: number
    findings: number
    externalPackages: number
  }
}

export type NodeDetailResponse = {
  node: VgNode
  outgoing: VgEdge[]
  incoming: VgEdge[]
}

export type FindingsResponse = { findings: Finding[] }

// Re-export to satisfy downstream consumers that might import from this file.
export type { BlastRadiusResult, ContextPack, Evidence, Finding, Snapshot, VgEdge, VgNode }

// ─── Default fetcher ──────────────────────────────────────────────────────────

const defaultFetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json() as Promise<unknown>
  })

// ─── Global SWR config — App.tsx wraps with <SWRConfig value={swrConfig}> ─────

export const swrConfig: SWRConfiguration = {
  fetcher: defaultFetcher,
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useSnapshot(): SWRResponse<Snapshot> {
  return useSWR<Snapshot>('/api/snapshot')
}

export function useOverview(): SWRResponse<OverviewResponse> {
  return useSWR<OverviewResponse>('/api/overview')
}

export function useFindings(opts?: {
  domain?: FindingDomain
  severity?: Severity
  status?: FindingStatus
}): SWRResponse<FindingsResponse> {
  const params = new URLSearchParams()
  if (opts?.domain !== undefined) params.set('domain', opts.domain)
  if (opts?.severity !== undefined) params.set('severity', opts.severity)
  if (opts?.status !== undefined) params.set('status', opts.status)
  const qs = params.toString()
  const key = qs.length > 0 ? `/api/findings?${qs}` : '/api/findings'
  return useSWR<FindingsResponse>(key)
}

export function useNode(id: string | null): SWRResponse<NodeDetailResponse> {
  const key = id !== null ? `/api/node?id=${id}` : null
  return useSWR<NodeDetailResponse>(key)
}

export function useBlastRadius(
  target: string | null,
  maxDepth?: number,
): SWRResponse<BlastRadiusResult> {
  let key: string | null = null
  if (target !== null) {
    const params = new URLSearchParams({ target })
    if (maxDepth !== undefined) params.set('maxDepth', String(maxDepth))
    key = `/api/blast-radius?${params.toString()}`
  }
  return useSWR<BlastRadiusResult>(key)
}

export function useContextPack(
  target: string | null,
  opts?: { maxTokens?: number },
): SWRResponse<ContextPack> {
  let key: string | null = null
  if (target !== null) {
    const params = new URLSearchParams({ target })
    if (opts?.maxTokens !== undefined) params.set('maxTokens', String(opts.maxTokens))
    key = `/api/context-pack?${params.toString()}`
  }
  return useSWR<ContextPack>(key, {
    revalidateOnFocus: false,
    revalidateIfStale: false,
  })
}

export function useEvidence(id: string | null): SWRResponse<Evidence> {
  const key = id !== null ? `/api/evidence?id=${encodeURIComponent(id)}` : null
  return useSWR<Evidence>(key)
}
