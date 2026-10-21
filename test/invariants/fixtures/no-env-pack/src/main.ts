/**
 * Entry point for the no-env-pack fixture.
 * Imports from helper.ts to create a real import edge in the graph.
 */
import { add, greet } from './helper.js'

export function run(): void {
  const msg = greet('World')
  const result = add(1, 2)
  console.log(msg, result)
}
