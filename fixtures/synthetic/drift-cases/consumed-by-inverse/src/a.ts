import { b } from './b.js'

// alpha imports beta (AST). beta.yml declares consumed_by: [alpha] (YAML).
// Both confirm alpha→beta — no drift expected.
export const a = b + 1
