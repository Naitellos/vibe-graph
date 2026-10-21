export const DEFAULT_IGNORE_PATTERNS: readonly string[] = [
  'node_modules',
  '.git',
  '.vibegraph',
  '.superpowers',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.cache',
  'coverage',
  '.env',
  '.env.*',
  '*.pem',
  '*.key',
  '*.cert',
  '*.p12',
  '*.log',
  '.DS_Store',
]

export const DEFAULT_DETECTOR_THRESHOLDS: Record<string, number> = {
  'core/fan-out': 6,
  'core/fan-in': 8,
}
