import { select } from 'd3-selection'
import { type ZoomBehavior, zoom } from 'd3-zoom'
import { useCallback, useEffect, useRef, useState } from 'react'
import { computeFitTransform } from './fit-transform.js'

/**
 * Wires d3-zoom to an SVGSVGElement ref and returns the current transform string.
 *
 * The returned transform string should be applied directly to the inner viewport <g>:
 *   <g className="vg-viewport" transform={transform}>
 *
 * When `content` bounds are provided, the graph is fit-to-viewport (scaled to fill
 * the available space with padding, centered) on mount, whenever the content bounds
 * change, AND whenever the SVG itself resizes (a ResizeObserver re-fits on panel
 * collapse/expand, separator drag, fullscreen, and window resize — restoring the
 * responsive behavior the removed SVG viewBox used to provide). Manual wheel/drag
 * zoom continues from the fitted base until the next re-fit.
 */
// 20%–400% zoom range; tuned for typical 50–500 node graphs.
const ZOOM_SCALE_EXTENT: [number, number] = [0.2, 4]

export function usePanZoom(content?: { width: number; height: number }): {
  svgRef: React.RefObject<SVGSVGElement | null>
  transform: string
} {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [transform, setTransform] = useState('')
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null)

  const contentWidth = content?.width ?? 0
  const contentHeight = content?.height ?? 0
  // Keep the latest bounds in a ref so the ResizeObserver callback (registered
  // once) always fits to the current graph size without re-subscribing.
  const contentRef = useRef({ width: contentWidth, height: contentHeight })
  contentRef.current = { width: contentWidth, height: contentHeight }

  // Fit the current content into the live client box, centered with padding.
  // No-ops when content or the client box isn't measurable yet (e.g. jsdom,
  // where getBoundingClientRect is 0 → transform stays identity for unit tests).
  const applyFit = useCallback(() => {
    const svg = svgRef.current
    const zoomBehavior = zoomRef.current
    if (!svg || !zoomBehavior) return
    const { width: cw, height: ch } = contentRef.current
    if (cw <= 0 || ch <= 0) return
    const rect = svg.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const fit = computeFitTransform({
      contentWidth: cw,
      contentHeight: ch,
      viewWidth: rect.width,
      viewHeight: rect.height,
      scaleExtent: ZOOM_SCALE_EXTENT,
    })
    // Apply via the behavior so d3-zoom's internal state stays in sync and
    // emits a 'zoom' event → updates `transform`. Manual pan/zoom then
    // continues from the fitted base.
    select(svg).call(zoomBehavior.transform, fit)
  }, [])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const sel = select(svg)
    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent(ZOOM_SCALE_EXTENT)
      .on('zoom', (event) => {
        setTransform(event.transform.toString())
      })
    zoomRef.current = zoomBehavior
    sel.call(zoomBehavior)

    // Re-fit whenever the SVG's rendered size changes. Transform changes do not
    // resize the element, so this does not feed back on itself.
    const observer = new ResizeObserver(() => {
      applyFit()
    })
    observer.observe(svg)

    return () => {
      sel.on('.zoom', null)
      observer.disconnect()
      zoomRef.current = null
    }
  }, [applyFit])

  // Re-fit when the graph's own bounds change (filters toggled, new snapshot).
  // contentWidth/contentHeight are intentional re-fit triggers; applyFit reads
  // the latest bounds from contentRef, so they aren't referenced in the body.
  // biome-ignore lint/correctness/useExhaustiveDependencies: deps are triggers, not reads
  useEffect(() => {
    applyFit()
  }, [contentWidth, contentHeight, applyFit])

  return { svgRef, transform }
}
