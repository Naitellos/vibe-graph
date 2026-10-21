export function edgeMidpoint(points: { x: number; y: number }[]): { x: number; y: number } {
  if (points.length === 0) return { x: 0, y: 0 }
  const midIndex = Math.floor(points.length / 2)
  const mid = points[midIndex]
  // mid is defined because midIndex < points.length (points.length >= 1 here)
  if (mid === undefined) return { x: 0, y: 0 }
  return mid
}
