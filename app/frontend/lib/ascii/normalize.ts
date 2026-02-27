import type { CanvasNode, PrimitiveKind, RenderOptions } from "./types"

const MIN_SIZE_BY_KIND: Record<PrimitiveKind, { w: number; h: number }> = {
  button: { w: 8, h: 3 },
  input: { w: 12, h: 3 },
  card: { w: 16, h: 7 },
  modal: { w: 20, h: 8 },
  nav: { w: 16, h: 3 },
  text: { w: 8, h: 1 },
  line: { w: 6, h: 1 },
  arrow: { w: 6, h: 1 },
  "dashed-line": { w: 6, h: 1 },
  "dashed-arrow": { w: 6, h: 1 },
  "double-arrow": { w: 7, h: 1 },
  "bidirectional-connector": { w: 7, h: 1 },
  junction: { w: 3, h: 3 },
  decision: { w: 9, h: 5 },
  io: { w: 12, h: 3 },
  document: { w: 12, h: 4 },
  storage: { w: 12, h: 5 },
  "swimlane-separator": { w: 12, h: 1 },
  note: { w: 10, h: 4 },
  "bullet-list": { w: 14, h: 4 },
}

const OPTIONAL_LABEL_KINDS = new Set<PrimitiveKind>([
  "line",
  "arrow",
  "dashed-line",
  "dashed-arrow",
  "double-arrow",
  "bidirectional-connector",
])

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function normalizeNodes(nodes: CanvasNode[], options: RenderOptions): CanvasNode[] {
  const maxX = Math.max(0, options.width - 1)
  const maxY = Math.max(0, options.height - 1)

  return nodes.map((node) => {
    const min = MIN_SIZE_BY_KIND[node.kind]
    const x = clamp(Math.trunc(node.x), 0, maxX)
    const y = clamp(Math.trunc(node.y), 0, maxY)
    const w = clamp(Math.trunc(node.w), min.w, Math.max(1, options.width - x))
    const h = clamp(Math.trunc(node.h), min.h, Math.max(1, options.height - y))
    const label = (node.label ?? "").trim()

    return {
      ...node,
      x,
      y,
      w,
      h,
      z: Math.trunc(node.z),
      label: label.length > 0 ? label : OPTIONAL_LABEL_KINDS.has(node.kind) ? "" : node.kind.toUpperCase(),
    }
  })
}
