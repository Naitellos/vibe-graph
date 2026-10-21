import useSWR from 'swr'

export interface SubsystemDocData {
  id: string
  title: string
  layer: string
  status: string
  description: string
  lastVerified?: string
  verifiedBy?: string
  match: string[]
  declaredDependsOn: string[]
  declaredConsumedBy: string[]
  schemaTables: string[]
  relatedSpecs: string[]
  relatedDecisions: string[]
  memoryRefs: string[]
}

export function useSubsystemDoc(slug: string | null) {
  return useSWR<SubsystemDocData | null>(
    slug ? `/api/subsystem-docs/${slug}` : null,
    async (url: string) => {
      const res = await fetch(url)
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`SubsystemDoc fetch failed: ${res.status}`)
      return (await res.json()) as SubsystemDocData
    },
  )
}
