export type PrimitiveKind =
  | "button"
  | "input"
  | "card"
  | "modal"
  | "nav"
  | "text"
  | "line"
  | "arrow"
  | "dashed-line"
  | "dashed-arrow"
  | "double-arrow"
  | "bidirectional-connector"
  | "junction"
  | "decision"
  | "io"
  | "document"
  | "storage"
  | "swimlane-separator"
  | "note"
  | "bullet-list"

export interface CanvasNode {
  id: string
  kind: PrimitiveKind
  label: string
  x: number
  y: number
  w: number
  h: number
  z: number
  startX?: number
  startY?: number
  endX?: number
  endY?: number
}

export interface RenderOptions {
  width: number
  height: number
}
