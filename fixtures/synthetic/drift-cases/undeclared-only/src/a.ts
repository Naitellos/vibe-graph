import { b } from './b.js'

// alpha imports beta via AST, but YAML has no depends_on
export const a = b + 1
