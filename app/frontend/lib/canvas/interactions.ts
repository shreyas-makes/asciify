import type { CanvasNode, PrimitiveKind } from "../ascii/types"

function clamp(value: number, min: number, max: number) {
  if (value < min) return min
  if (value > max) return max
  return value
}

export function createPlacementEditState(node: CanvasNode) {
  return {
    selectedId: node.id,
    selectedIds: [node.id],
    editingId: node.id,
    editingLabel: node.label,
  }
}

export function shouldCommitInlineEditKey(key: string) {
  return key === "Enter" || key === "Escape"
}

export function getNodeTextScale(
  node: CanvasNode,
  charWidthPx: number,
  lineHeightPx: number,
) {
  const widthPx = Math.max(charWidthPx, node.w * charWidthPx)
  const heightPx = Math.max(lineHeightPx, node.h * lineHeightPx)
  const scaledFont = Math.floor(Math.min(widthPx / 8, heightPx / 2.4))
  const fontSize = clamp(scaledFont, 10, 18)
  const lineHeight = clamp(fontSize + 4, 14, 24)
  const badgeFontSize = clamp(fontSize - 1, 9, 16)
  return { fontSize, lineHeight, badgeFontSize }
}

const DEFAULT_NODE_SIZE: Record<PrimitiveKind, { w: number; h: number; label: string }> = {
  button: { w: 10, h: 3, label: "Button" },
  input: { w: 20, h: 3, label: "Input" },
  card: { w: 24, h: 8, label: "Card" },
  modal: { w: 30, h: 10, label: "Modal" },
  nav: { w: 34, h: 3, label: "Nav" },
  text: { w: 22, h: 1, label: "Text" },
  line: { w: 14, h: 1, label: "" },
  arrow: { w: 14, h: 1, label: "" },
  "dashed-line": { w: 14, h: 1, label: "" },
  "dashed-arrow": { w: 14, h: 1, label: "" },
  "double-arrow": { w: 14, h: 1, label: "" },
  "bidirectional-connector": { w: 14, h: 1, label: "" },
  junction: { w: 5, h: 5, label: "Junction" },
  decision: { w: 11, h: 7, label: "Decision" },
  io: { w: 16, h: 4, label: "IO" },
  document: { w: 16, h: 5, label: "Doc" },
  storage: { w: 16, h: 6, label: "Store" },
  "swimlane-separator": { w: 24, h: 1, label: "Lane" },
  note: { w: 14, h: 5, label: "Note" },
  "bullet-list": { w: 18, h: 6, label: "List" },
}

const CONNECTOR_KINDS = new Set<PrimitiveKind>([
  "line",
  "arrow",
  "dashed-line",
  "dashed-arrow",
  "double-arrow",
  "bidirectional-connector",
])

export function isConnectorKind(kind: PrimitiveKind) {
  return CONNECTOR_KINDS.has(kind)
}

function nextNodeId(nodes: CanvasNode[]) {
  const maxId = nodes.reduce((max, node) => {
    const value = Number(node.id.replace("node-", ""))
    return Number.isFinite(value) ? Math.max(max, value) : max
  }, 0)
  return `node-${maxId + 1}`
}

interface TwoPointNodeArgs {
  kind: PrimitiveKind
  nodes: CanvasNode[]
  canvasWidth: number
  canvasHeight: number
  startX: number
  startY: number
  endX: number
  endY: number
}

export function createNodeFromTwoPoints({
  kind,
  nodes,
  canvasWidth,
  canvasHeight,
  startX,
  startY,
  endX,
  endY,
}: TwoPointNodeArgs): CanvasNode {
  const primitive = DEFAULT_NODE_SIZE[kind]
  const maxX = Math.max(0, canvasWidth - 1)
  const maxY = Math.max(0, canvasHeight - 1)
  const anchorX = clamp(startX, 0, maxX)
  const anchorY = clamp(startY, 0, maxY)
  const targetX = clamp(endX, 0, maxX)
  const targetY = clamp(endY, 0, maxY)
  const hasSpan = anchorX !== targetX || anchorY !== targetY

  if (isConnectorKind(kind)) {
    const resolvedEndX = hasSpan
      ? targetX
      : clamp(anchorX + Math.max(1, primitive.w - 1), 0, maxX)
    const resolvedEndY = hasSpan ? targetY : anchorY

    return {
      id: nextNodeId(nodes),
      kind,
      label: primitive.label,
      x: Math.min(anchorX, resolvedEndX),
      y: Math.min(anchorY, resolvedEndY),
      w: Math.abs(resolvedEndX - anchorX) + 1,
      h: Math.abs(resolvedEndY - anchorY) + 1,
      z: nodes.length + 1,
      startX: anchorX,
      startY: anchorY,
      endX: resolvedEndX,
      endY: resolvedEndY,
    }
  }

  if (!hasSpan) {
    return {
      id: nextNodeId(nodes),
      kind,
      label: primitive.label,
      x: clamp(anchorX, 0, Math.max(0, canvasWidth - primitive.w)),
      y: clamp(anchorY, 0, Math.max(0, canvasHeight - primitive.h)),
      w: primitive.w,
      h: primitive.h,
      z: nodes.length + 1,
    }
  }

  return {
    id: nextNodeId(nodes),
    kind,
    label: primitive.label,
    x: Math.min(anchorX, targetX),
    y: Math.min(anchorY, targetY),
    w: Math.abs(targetX - anchorX) + 1,
    h: Math.abs(targetY - anchorY) + 1,
    z: nodes.length + 1,
  }
}
