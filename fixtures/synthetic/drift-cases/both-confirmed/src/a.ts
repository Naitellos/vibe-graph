import { b } from './b.js'

// alpha imports beta via AST — YAML also declares depends_on: [beta]
export const a = b + 1
