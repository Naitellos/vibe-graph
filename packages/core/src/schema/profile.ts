import { EdgeKindSchema, LayerSchema, NodeKindSchema } from './common.js'

/**
 * Domain profile — the §8.1 seam that keeps the engine neutral. A profile
 * declares which node/edge kinds and layers a domain (code, knowledge, …)
 * contributes to the graph vocabulary. Today only the built-in code profile
 * exists; the enum→registry migration happens pulled-by-need when a second
 * extractor registers real kinds (product-definition §6, extractor 1.5).
 */
export interface DomainProfile {
  readonly id: string
  readonly nodeKinds: readonly string[]
  readonly edgeKinds: readonly string[]
  readonly layers: readonly string[]
}

export const CODE_PROFILE: DomainProfile = {
  id: 'code',
  nodeKinds: NodeKindSchema.options,
  edgeKinds: EdgeKindSchema.options,
  layers: LayerSchema.options,
}

const PROFILES: ReadonlyMap<string, DomainProfile> = new Map([[CODE_PROFILE.id, CODE_PROFILE]])

export function getDomainProfile(id: string): DomainProfile {
  const profile = PROFILES.get(id)
  if (!profile) {
    throw new Error(`Unknown domain profile: ${id}. Registered: ${[...PROFILES.keys()].join(', ')}`)
  }
  return profile
}
