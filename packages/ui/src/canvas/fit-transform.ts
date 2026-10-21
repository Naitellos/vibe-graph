import { type ZoomTransform, zoomIdentity } from 'd3-zoom'

export interface FitTransformInput {
  /** Width of the laid-out graph content, in content units. */
  contentWidth: number
  /** Height of the laid-out graph content, in content units. */
  contentHeight: number
  /** Width of the viewport (SVG client box), in pixels. */
  viewWidth: number
  /** Height of the viewport (SVG client box), in pixels. */
  viewHeight: number
  /** Empty margin to keep around the content, in pixels. Default 40. */
  padding?: number
  /** [min, max] scale clamp, matching the pan/zoom behavior. Default [0.2, 4]. */
  scaleExtent?: [number, number]
}

/**
 * Compute a d3-zoom transform that scales `content` to fit inside the viewport
 * with uniform scaling, centered on both axes, leaving `padding` px of margin,
 * clamped to `scaleExtent`.
 *
 * Returns the identity transform for degenerate inputs (non-positive dimensions)
 * so callers can apply the result unconditionally.
 */
export function computeFitTransform(input: FitTransformInput): ZoomTransform {
  const { contentWidth, contentHeight, viewWidth, viewHeight } = input
  const padding = input.padding ?? 40
  const [minScale, maxScale] = input.scaleExtent ?? [0.2, 4]

  if (contentWidth <= 0 || contentHeight <= 0 || viewWidth <= 0 || viewHeight <= 0) {
    return zoomIdentity
  }

  // Available drawing area after reserving padding on each side.
  const availWidth = Math.max(1, viewWidth - padding * 2)
  const availHeight = Math.max(1, viewHeight - padding * 2)

  const rawScale = Math.min(availWidth / contentWidth, availHeight / contentHeight)
  const scale = Math.max(minScale, Math.min(maxScale, rawScale))

  // Center the scaled content within the full viewport.
  const tx = (viewWidth - contentWidth * scale) / 2
  const ty = (viewHeight - contentHeight * scale) / 2

  return zoomIdentity.translate(tx, ty).scale(scale)
}
