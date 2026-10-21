/**
 * Helper module for the no-env-pack fixture.
 * Used by main.ts to provide utility functions.
 */
export function greet(name: string): string {
  return `Hello, ${name}!`
}

export function add(a: number, b: number): number {
  return a + b
}
