import { Head, Link, usePage } from "@inertiajs/react"
import {
  ChevronDown,
  Copy,
  Download,
  Eraser,
  Eye,
  LayoutDashboard,
  LogIn,
  Moon,
  MoreHorizontal,
  Share2,
  Sun,
  Trash2,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import AppLogoIcon from "@/components/app-logo-icon"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { designClasses } from "@/design-system"
import { useClipboard } from "@/hooks/use-clipboard"
import { normalizeNodes } from "@/lib/ascii/normalize"
import { renderAscii, renderMarkdown } from "@/lib/ascii/render"
import type { CanvasNode, PrimitiveKind } from "@/lib/ascii/types"
import {
  createNodeFromTwoPoints,
  createPlacementEditState,
  getNodeTextScale,
  isConnectorKind,
  shouldCommitInlineEditKey,
} from "@/lib/canvas/interactions"
import { dashboardPath, signInPath } from "@/routes"
import type { SharedProps } from "@/types"

const DEFAULT_CANVAS_WIDTH = 88
const DEFAULT_CANVAS_HEIGHT = 34
const ASCII_LINE_HEIGHT_PX = 16
const AUTOSAVE_DEBOUNCE_MS = 600
const MIN_NODE_WIDTH = 1
const MIN_NODE_HEIGHT = 1
const DRAG_THRESHOLD_PX = 4
const ASCII_FONT_FAMILY =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'

type DraftSaveState = "idle" | "saving" | "saved" | "error"
type ShareClaimState = "idle" | "claiming" | "claimed" | "error"
type DragMode = "move" | "resize"
type CanvasViewMode = "edit" | "preview"
type SharePermission = "view" | "edit"
type PreviewTheme = "light" | "dark"

interface HomePageProps extends SharedProps {
  sharedToken?: string
  sharedPermission?: SharePermission
  [key: string]: unknown
}

interface DragState {
  active: boolean
  mode: DragMode
  nodeId: string
  moveNodeIds: string[]
  moveOrigins: Record<string, { x: number; y: number }>
  startClientX: number
  startClientY: number
  originX: number
  originY: number
  originW: number
  originH: number
}

interface LassoState {
  startX: number
  startY: number
  additive: boolean
}

interface PlacementState {
  kind: PrimitiveKind
  startX: number
  startY: number
  currentX: number
  currentY: number
}

const PRIMITIVES: {
  kind: PrimitiveKind
  name: string
  defaultLabel: string
  w: number
  h: number
}[] = [
  { kind: "button", name: "Button", defaultLabel: "Button", w: 10, h: 3 },
  { kind: "input", name: "Input", defaultLabel: "Input", w: 20, h: 3 },
  { kind: "card", name: "Card", defaultLabel: "Card", w: 24, h: 8 },
  { kind: "modal", name: "Modal", defaultLabel: "Modal", w: 30, h: 10 },
  { kind: "nav", name: "Nav", defaultLabel: "Nav", w: 34, h: 3 },
  { kind: "text", name: "Text", defaultLabel: "Text", w: 22, h: 1 },
  { kind: "line", name: "Line", defaultLabel: "", w: 14, h: 1 },
  { kind: "dashed-line", name: "Dashed Line", defaultLabel: "", w: 14, h: 1 },
  { kind: "arrow", name: "Arrow", defaultLabel: "", w: 14, h: 1 },
  { kind: "dashed-arrow", name: "Dashed Arrow", defaultLabel: "", w: 14, h: 1 },
  {
    kind: "bidirectional-connector",
    name: "Double Arrow",
    defaultLabel: "",
    w: 14,
    h: 1,
  },
  {
    kind: "double-arrow",
    name: "Dashed Double",
    defaultLabel: "",
    w: 14,
    h: 1,
  },
  { kind: "junction", name: "Junction", defaultLabel: "Junction", w: 5, h: 5 },
  { kind: "decision", name: "Decision", defaultLabel: "Decision", w: 11, h: 7 },
  { kind: "io", name: "IO", defaultLabel: "IO", w: 16, h: 4 },
  { kind: "document", name: "Doc", defaultLabel: "Doc", w: 16, h: 5 },
  { kind: "storage", name: "Store", defaultLabel: "Store", w: 16, h: 6 },
  {
    kind: "swimlane-separator",
    name: "Lane",
    defaultLabel: "Lane",
    w: 24,
    h: 1,
  },
  { kind: "note", name: "Note", defaultLabel: "Note", w: 14, h: 5 },
  { kind: "bullet-list", name: "List", defaultLabel: "List", w: 18, h: 6 },
]

const OPTIONAL_LABEL_KINDS = new Set<PrimitiveKind>([
  "line",
  "arrow",
  "dashed-line",
  "dashed-arrow",
  "double-arrow",
  "bidirectional-connector",
])

const PRIMARY_PRIMITIVE_KINDS: PrimitiveKind[] = [
  "button",
  "input",
  "card",
  "text",
  "line",
  "arrow",
  "decision",
  "note",
]

function createNodeFromPrimitive(
  kind: PrimitiveKind,
  nodes: CanvasNode[],
  canvasWidth: number,
  canvasHeight: number,
  startX?: number,
  startY?: number,
  endX?: number,
  endY?: number,
): CanvasNode {
  const offset = nodes.length
  const defaultX = clamp(2 + (offset % 8) * 3, 0, Math.max(0, canvasWidth - 1))
  const defaultY = clamp(2 + (offset % 6) * 2, 0, Math.max(0, canvasHeight - 1))

  return createNodeFromTwoPoints({
    kind,
    nodes,
    canvasWidth,
    canvasHeight,
    startX: startX ?? defaultX,
    startY: startY ?? defaultY,
    endX: endX ?? startX ?? defaultX,
    endY: endY ?? startY ?? defaultY,
  })
}

function clamp(value: number, min: number, max: number) {
  if (value < min) return min
  if (value > max) return max
  return value
}

function getGridPointFromPointer(
  event: Pick<PointerEvent, "clientX" | "clientY">,
  canvas: HTMLDivElement,
  charWidthPx: number,
  canvasWidth: number,
  canvasHeight: number,
) {
  const rect = canvas.getBoundingClientRect()
  const pixelX = clamp(event.clientX - rect.left, 0, rect.width)
  const pixelY = clamp(event.clientY - rect.top, 0, rect.height)
  return {
    gridX: clamp(Math.floor(pixelX / Math.max(1, charWidthPx)), 0, canvasWidth - 1),
    gridY: clamp(Math.floor(pixelY / ASCII_LINE_HEIGHT_PX), 0, canvasHeight - 1),
    pixelX,
    pixelY,
  }
}

function PrimitiveGlyph({
  kind,
  className,
}: {
  kind: PrimitiveKind
  className?: string
}) {
  const base = "stroke-current fill-none"

  switch (kind) {
    case "button":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
          <rect
            x="4"
            y="7"
            width="16"
            height="10"
            rx="2.5"
            className={base}
            strokeWidth="2"
          />
        </svg>
      )
    case "input":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
          <rect
            x="3.5"
            y="5"
            width="17"
            height="14"
            rx="2"
            className={base}
            strokeWidth="2"
          />
          <line
            x1="6.5"
            y1="10"
            x2="17.5"
            y2="10"
            className={base}
            strokeWidth="2"
          />
          <line
            x1="6.5"
            y1="14"
            x2="14.5"
            y2="14"
            className={base}
            strokeWidth="2"
          />
        </svg>
      )
    case "card":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
          <rect
            x="4"
            y="4.5"
            width="16"
            height="15"
            rx="2"
            className={base}
            strokeWidth="2"
          />
          <line
            x1="6.5"
            y1="9"
            x2="17.5"
            y2="9"
            className={base}
            strokeWidth="2"
          />
          <line
            x1="6.5"
            y1="12.5"
            x2="14.5"
            y2="12.5"
            className={base}
            strokeWidth="2"
          />
        </svg>
      )
    case "modal":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
          <rect
            x="3"
            y="4"
            width="18"
            height="16"
            rx="2"
            className={base}
            strokeWidth="2"
          />
          <line x1="3" y1="9" x2="21" y2="9" className={base} strokeWidth="2" />
          <rect
            x="6.5"
            y="12"
            width="11"
            height="5"
            rx="1"
            className={base}
            strokeWidth="2"
          />
        </svg>
      )
    case "nav":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
          <rect
            x="4"
            y="5"
            width="4.5"
            height="4.5"
            rx="1"
            className={base}
            strokeWidth="2"
          />
          <rect
            x="10.75"
            y="5"
            width="9.25"
            height="4.5"
            rx="1"
            className={base}
            strokeWidth="2"
          />
          <rect
            x="4"
            y="12"
            width="4.5"
            height="7"
            rx="1"
            className={base}
            strokeWidth="2"
          />
          <rect
            x="10.75"
            y="12"
            width="9.25"
            height="7"
            rx="1"
            className={base}
            strokeWidth="2"
          />
        </svg>
      )
    case "text":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
          <line x1="5" y1="6" x2="19" y2="6" className={base} strokeWidth="2" />
          <line
            x1="12"
            y1="6"
            x2="12"
            y2="18"
            className={base}
            strokeWidth="2"
          />
          <line
            x1="8.5"
            y1="18"
            x2="15.5"
            y2="18"
            className={base}
            strokeWidth="2"
          />
        </svg>
      )
    case "line":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
          <line
            x1="4"
            y1="12"
            x2="20"
            y2="12"
            className={base}
            strokeWidth="2"
          />
        </svg>
      )
    case "arrow":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
          <line
            x1="4"
            y1="12"
            x2="18"
            y2="12"
            className={base}
            strokeWidth="2"
          />
          <polyline
            points="14,8 18,12 14,16"
            className={base}
            strokeWidth="2"
          />
        </svg>
      )
    case "dashed-line":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
          <line
            x1="4"
            y1="12"
            x2="20"
            y2="12"
            className={base}
            strokeWidth="2"
            strokeDasharray="3 2"
          />
        </svg>
      )
    case "dashed-arrow":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
          <line
            x1="4"
            y1="12"
            x2="18"
            y2="12"
            className={base}
            strokeWidth="2"
            strokeDasharray="3 2"
          />
          <polyline
            points="14,8 18,12 14,16"
            className={base}
            strokeWidth="2"
          />
        </svg>
      )
    case "double-arrow":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
          <line
            x1="5"
            y1="12"
            x2="19"
            y2="12"
            className={base}
            strokeWidth="2"
            strokeDasharray="3 2"
          />
          <polyline points="8,8 4,12 8,16" className={base} strokeWidth="2" />
          <polyline
            points="16,8 20,12 16,16"
            className={base}
            strokeWidth="2"
          />
        </svg>
      )
    case "bidirectional-connector":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
          <line
            x1="5"
            y1="12"
            x2="19"
            y2="12"
            className={base}
            strokeWidth="2"
          />
          <polyline points="8,8 4,12 8,16" className={base} strokeWidth="2" />
          <polyline
            points="16,8 20,12 16,16"
            className={base}
            strokeWidth="2"
          />
        </svg>
      )
    case "junction":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
          <line
            x1="4"
            y1="12"
            x2="20"
            y2="12"
            className={base}
            strokeWidth="2"
          />
          <line
            x1="12"
            y1="4"
            x2="12"
            y2="20"
            className={base}
            strokeWidth="2"
          />
          <circle cx="12" cy="12" r="1.6" className="fill-current" />
        </svg>
      )
    case "decision":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
          <polygon
            points="12,4 20,12 12,20 4,12"
            className={base}
            strokeWidth="2"
          />
        </svg>
      )
    case "io":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
          <polygon
            points="7,5 21,5 17,19 3,19"
            className={base}
            strokeWidth="2"
          />
        </svg>
      )
    case "document":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
          <path d="M6 4h9l4 4v12H6z" className={base} strokeWidth="2" />
          <polyline points="15,4 15,8 19,8" className={base} strokeWidth="2" />
        </svg>
      )
    case "storage":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
          <ellipse
            cx="12"
            cy="6.5"
            rx="6.5"
            ry="2.5"
            className={base}
            strokeWidth="2"
          />
          <path
            d="M5.5 6.5v10c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-10"
            className={base}
            strokeWidth="2"
          />
          <path
            d="M5.5 11.5c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5"
            className={base}
            strokeWidth="2"
          />
        </svg>
      )
    case "swimlane-separator":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
          <line
            x1="4"
            y1="10"
            x2="20"
            y2="10"
            className={base}
            strokeWidth="2"
          />
          <line
            x1="4"
            y1="14"
            x2="20"
            y2="14"
            className={base}
            strokeWidth="2"
            strokeDasharray="2.5 2"
          />
        </svg>
      )
    case "note":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
          <path d="M5 4h14v16H5z" className={base} strokeWidth="2" />
          <path d="M14 20v-5h5" className={base} strokeWidth="2" />
        </svg>
      )
    case "bullet-list":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
          <circle cx="6" cy="7.5" r="1.2" className="fill-current" />
          <circle cx="6" cy="12" r="1.2" className="fill-current" />
          <circle cx="6" cy="16.5" r="1.2" className="fill-current" />
          <line
            x1="9"
            y1="7.5"
            x2="19"
            y2="7.5"
            className={base}
            strokeWidth="2"
          />
          <line
            x1="9"
            y1="12"
            x2="19"
            y2="12"
            className={base}
            strokeWidth="2"
          />
          <line
            x1="9"
            y1="16.5"
            x2="19"
            y2="16.5"
            className={base}
            strokeWidth="2"
          />
        </svg>
      )
    default:
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
          <rect
            x="4"
            y="7"
            width="16"
            height="10"
            rx="2.5"
            className={base}
            strokeWidth="2"
          />
        </svg>
      )
  }
}

function getConnectorEndpoints(node: CanvasNode) {
  if (
    typeof node.startX === "number" &&
    typeof node.startY === "number" &&
    typeof node.endX === "number" &&
    typeof node.endY === "number"
  ) {
    return {
      startX: node.startX,
      startY: node.startY,
      endX: node.endX,
      endY: node.endY,
    }
  }

  if (node.w >= node.h) {
    const y = node.y + Math.floor(node.h / 2)
    return {
      startX: node.x,
      startY: y,
      endX: node.x + node.w - 1,
      endY: y,
    }
  }

  const x = node.x + Math.floor(node.w / 2)
  return {
    startX: x,
    startY: node.y,
    endX: x,
    endY: node.y + node.h - 1,
  }
}

function connectorArrowHead(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  size = 7,
) {
  const dx = toX - fromX
  const dy = toY - fromY
  const length = Math.hypot(dx, dy)
  if (length === 0) return ""

  const ux = dx / length
  const uy = dy / length
  const perpX = -uy
  const perpY = ux
  const baseX = toX - ux * size
  const baseY = toY - uy * size
  const wing = Math.max(2.5, size * 0.58)

  const leftX = baseX + perpX * wing
  const leftY = baseY + perpY * wing
  const rightX = baseX - perpX * wing
  const rightY = baseY - perpY * wing

  return `${leftX},${leftY} ${toX},${toY} ${rightX},${rightY}`
}

function downloadMarkdown(markdown: string) {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = "asciify-draft.md"
  anchor.click()
  URL.revokeObjectURL(url)
}

function csrfToken() {
  const token = document
    .querySelector('meta[name="csrf-token"]')
    ?.getAttribute("content")
  return token ?? ""
}

async function parseJsonSafe(
  response: Response,
): Promise<Record<string, unknown>> {
  const contentType = response.headers.get("content-type") ?? ""
  if (!contentType.includes("application/json")) {
    return {}
  }

  try {
    return (await response.json()) as Record<string, unknown>
  } catch {
    return {}
  }
}

function isCanvasNode(value: unknown): value is CanvasNode {
  if (!value || typeof value !== "object") return false

  const node = value as Record<string, unknown>
  return (
    typeof node.id === "string" &&
    typeof node.kind === "string" &&
    typeof node.label === "string" &&
    typeof node.x === "number" &&
    typeof node.y === "number" &&
    typeof node.w === "number" &&
    typeof node.h === "number" &&
    typeof node.z === "number"
  )
}

export default function Home() {
  const page = usePage<HomePageProps>()
  const { auth } = page.props
  const sharedToken =
    typeof page.props.sharedToken === "string" ? page.props.sharedToken : null
  const initialSharedPermission =
    page.props.sharedPermission === "edit" ? "edit" : "view"
  const isSharedView = Boolean(sharedToken)
  const [copiedValue, copy] = useClipboard()

  const [nodes, setNodes] = useState<CanvasNode[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingLabel, setEditingLabel] = useState("")
  const [draftVersion, setDraftVersion] = useState(0)
  const [, setDraftSaveState] = useState<DraftSaveState>("idle")
  const [, setDraftError] = useState<string | null>(null)
  const [draftLoaded, setDraftLoaded] = useState(false)
  const [shareClaimState, setShareClaimState] =
    useState<ShareClaimState>("idle")
  const [shareMessage, setShareMessage] = useState<string | null>(null)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [sharePermission, setSharePermission] =
    useState<SharePermission | null>(null)
  const [currentSharedPermission, setCurrentSharedPermission] =
    useState<SharePermission>(initialSharedPermission)
  const [shareUpdating, setShareUpdating] = useState(false)
  const [canvasViewMode, setCanvasViewMode] = useState<CanvasViewMode>(
    isSharedView && initialSharedPermission === "view" ? "preview" : "edit",
  )
  const [previewTheme, setPreviewTheme] = useState<PreviewTheme>("dark")
  const [showAllPrimitives, setShowAllPrimitives] = useState(false)
  const [armedPrimitiveKind, setArmedPrimitiveKind] =
    useState<PrimitiveKind | null>(null)
  const [placementState, setPlacementState] = useState<PlacementState | null>(
    null,
  )

  const autosaveTimerRef = useRef<number | null>(null)
  const draftVersionRef = useRef(0)
  const saveInFlightRef = useRef(false)
  const queuedNodesRef = useRef<CanvasNode[] | null>(null)
  const lastSavedNodesRef = useRef("[]")
  const canvasFrameRef = useRef<HTMLDivElement | null>(null)
  const canvasViewportRef = useRef<HTMLDivElement | null>(null)
  const charProbeRef = useRef<HTMLSpanElement | null>(null)
  const dragStateRef = useRef<DragState | null>(null)
  const lassoStateRef = useRef<LassoState | null>(null)
  const isSignedIn = Boolean(auth?.user?.id)
  const canEdit = !isSharedView || currentSharedPermission === "edit"
  const [canvasWidth, setCanvasWidth] = useState(DEFAULT_CANVAS_WIDTH)
  const [canvasHeight, setCanvasHeight] = useState(DEFAULT_CANVAS_HEIGHT)
  const [charWidthPx, setCharWidthPx] = useState(8)
  const [lassoRect, setLassoRect] = useState<{
    x: number
    y: number
    w: number
    h: number
  } | null>(null)

  function armPrimitive(kind: PrimitiveKind) {
    setArmedPrimitiveKind((current) => (current === kind ? null : kind))
    setPlacementState(null)
    setShowAllPrimitives(false)
    setEditingId(null)
  }

  const selectedNode = nodes.find((node) => node.id === selectedId) ?? null
  const editingNode = nodes.find((node) => node.id === editingId) ?? null

  function startInlineEdit(node: CanvasNode) {
    setSelectedId(node.id)
    setSelectedIds([node.id])
    setEditingId(node.id)
    setEditingLabel(node.label)
  }

  function commitInlineEdit() {
    if (!editingNode) {
      setEditingId(null)
      return
    }
    const nextLabel = editingLabel.trim()
    setNodes((current) =>
      current.map((node) =>
        node.id === editingNode.id
          ? {
              ...node,
              label:
                nextLabel.length > 0 || OPTIONAL_LABEL_KINDS.has(node.kind)
                  ? nextLabel
                  : node.label,
            }
          : node,
      ),
    )
    setEditingId(null)
  }

  function clearCanvas() {
    setNodes([])
    setSelectedId(null)
    setSelectedIds([])
    setEditingId(null)
  }

  const deleteSelectedNode = useCallback(() => {
    if (selectedIds.length === 0) return
    const selectedSet = new Set(selectedIds)
    setNodes((current) => current.filter((node) => !selectedSet.has(node.id)))
    setEditingId(null)
    setSelectedId(null)
    setSelectedIds([])
  }, [selectedIds])

  const updateNodeGeometry = useCallback(
    (nodeId: string, updates: Partial<CanvasNode>) => {
      setNodes((current) =>
        current.map((node) => {
          if (node.id !== nodeId) return node

          const nextX = updates.x ?? node.x
          const nextY = updates.y ?? node.y
          const nextW = updates.w ?? node.w
          const nextH = updates.h ?? node.h
          const nextZ = updates.z ?? node.z

          const clampedX = clamp(nextX, 0, canvasWidth - 1)
          const clampedY = clamp(nextY, 0, canvasHeight - 1)
          const maxWidth = Math.max(MIN_NODE_WIDTH, canvasWidth - clampedX)
          const maxHeight = Math.max(MIN_NODE_HEIGHT, canvasHeight - clampedY)

          return {
            ...node,
            ...updates,
            x: clampedX,
            y: clampedY,
            w: clamp(nextW, MIN_NODE_WIDTH, maxWidth),
            h: clamp(nextH, MIN_NODE_HEIGHT, maxHeight),
            z: Math.max(0, nextZ),
          }
        }),
      )
    },
    [canvasHeight, canvasWidth],
  )

  const beginDrag = useCallback(
    (
      event: React.PointerEvent<HTMLElement>,
      node: CanvasNode,
      mode: DragMode,
    ) => {
      if (event.button !== 0) return
      if (mode === "resize") {
        event.preventDefault()
        event.stopPropagation()
      }

      const isNodeInSelection = selectedIds.includes(node.id)
      const moveNodeIds =
        mode === "move"
          ? isNodeInSelection
            ? selectedIds
            : [node.id]
          : [node.id]
      const moveOrigins = Object.fromEntries(
        nodes
          .filter((item) => moveNodeIds.includes(item.id))
          .map((item) => [item.id, { x: item.x, y: item.y }]),
      )

      dragStateRef.current = {
        active: mode === "resize",
        mode,
        nodeId: node.id,
        moveNodeIds,
        moveOrigins,
        startClientX: event.clientX,
        startClientY: event.clientY,
        originX: node.x,
        originY: node.y,
        originW: node.w,
        originH: node.h,
      }
      setEditingId(null)
      setSelectedId(node.id)
      setSelectedIds(moveNodeIds)
    },
    [nodes, selectedIds],
  )

  const applyDragDelta = useCallback(
    (clientX: number, clientY: number) => {
      const drag = dragStateRef.current
      const canvas = canvasFrameRef.current
      if (!drag || !canvas) return

      const pxToGridX = canvasWidth / canvas.clientWidth
      const pxToGridY = canvasHeight / canvas.clientHeight
      const deltaX = Math.round((clientX - drag.startClientX) * pxToGridX)
      const deltaY = Math.round((clientY - drag.startClientY) * pxToGridY)

      if (drag.mode === "move") {
        if (!drag.active) {
          const movedX = Math.abs(clientX - drag.startClientX)
          const movedY = Math.abs(clientY - drag.startClientY)
          if (movedX < DRAG_THRESHOLD_PX && movedY < DRAG_THRESHOLD_PX) return
          drag.active = true
        }
        const movingIds = new Set(drag.moveNodeIds)
        setNodes((current) =>
          current.map((node) => {
            if (!movingIds.has(node.id)) return node
            const origin = drag.moveOrigins[node.id]
            if (!origin) return node

            const nextX = clamp(origin.x + deltaX, 0, canvasWidth - 1)
            const nextY = clamp(origin.y + deltaY, 0, canvasHeight - 1)
            const maxWidth = Math.max(MIN_NODE_WIDTH, canvasWidth - nextX)
            const maxHeight = Math.max(MIN_NODE_HEIGHT, canvasHeight - nextY)
            const shiftX = nextX - origin.x
            const shiftY = nextY - origin.y

            return {
              ...node,
              x: nextX,
              y: nextY,
              w: clamp(node.w, MIN_NODE_WIDTH, maxWidth),
              h: clamp(node.h, MIN_NODE_HEIGHT, maxHeight),
              startX:
                typeof node.startX === "number"
                  ? clamp(node.startX + shiftX, 0, canvasWidth - 1)
                  : undefined,
              startY:
                typeof node.startY === "number"
                  ? clamp(node.startY + shiftY, 0, canvasHeight - 1)
                  : undefined,
              endX:
                typeof node.endX === "number"
                  ? clamp(node.endX + shiftX, 0, canvasWidth - 1)
                  : undefined,
              endY:
                typeof node.endY === "number"
                  ? clamp(node.endY + shiftY, 0, canvasHeight - 1)
                  : undefined,
            }
          }),
        )
        return
      }

      updateNodeGeometry(drag.nodeId, {
        w: drag.originW + deltaX,
        h: drag.originH + deltaY,
      })
    },
    [canvasHeight, canvasWidth, updateNodeGeometry],
  )

  const beginLasso = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return
      if (event.target !== event.currentTarget) return

      const canvas = canvasFrameRef.current
      if (!canvas) return

      const point = getGridPointFromPointer(
        event,
        canvas,
        charWidthPx,
        canvasWidth,
        canvasHeight,
      )

      if (armedPrimitiveKind) {
        const currentPlacement = placementState
        if (currentPlacement?.kind !== armedPrimitiveKind) {
          setPlacementState({
            kind: armedPrimitiveKind,
            startX: point.gridX,
            startY: point.gridY,
            currentX: point.gridX,
            currentY: point.gridY,
          })
          setSelectedId(null)
          setSelectedIds([])
          setEditingId(null)
          return
        }

        setNodes((current) => {
          const node = createNodeFromPrimitive(
            armedPrimitiveKind,
            current,
            canvasWidth,
            canvasHeight,
            currentPlacement.startX,
            currentPlacement.startY,
            point.gridX,
            point.gridY,
          )
          const editState = createPlacementEditState(node)
          setSelectedId(editState.selectedId)
          setSelectedIds(editState.selectedIds)
          setEditingId(editState.editingId)
          setEditingLabel(editState.editingLabel)
          setArmedPrimitiveKind(null)
          setPlacementState(null)
          return [...current, node]
        })
        return
      }

      const startX = point.pixelX
      const startY = point.pixelY
      const additive = event.shiftKey || event.metaKey || event.ctrlKey

      lassoStateRef.current = { startX, startY, additive }
      setLassoRect({ x: startX, y: startY, w: 0, h: 0 })
      setEditingId(null)
      if (!additive) {
        setSelectedId(null)
        setSelectedIds([])
      }
    },
    [armedPrimitiveKind, canvasHeight, canvasWidth, charWidthPx, placementState],
  )

  const saveDraft = useCallback(
    async (draftNodes: CanvasNode[]) => {
      if (!canEdit) return

      const query = sharedToken
        ? `?share_token=${encodeURIComponent(sharedToken)}`
        : ""
      setDraftSaveState("saving")
      setDraftError(null)

      const response = await fetch(`/draft${query}`, {
        method: "PUT",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-CSRF-Token": csrfToken(),
        },
        body: JSON.stringify({
          nodes: draftNodes,
          version: draftVersionRef.current,
        }),
      })

      const body = await parseJsonSafe(response)
      const errorCode =
        typeof body.error === "string" ? body.error : "save_failed"
      const responseVersion =
        typeof body.version === "number" ? body.version : null

      if (!response.ok) {
        if (response.status === 403) {
          setDraftSaveState("error")
          setDraftError("This shared draft is view-only.")
          return
        }
        if (typeof responseVersion === "number") {
          draftVersionRef.current = responseVersion
          setDraftVersion(responseVersion)
        }
        throw new Error(errorCode)
      }

      const nextVersion =
        typeof responseVersion === "number"
          ? responseVersion
          : draftVersionRef.current
      draftVersionRef.current = nextVersion
      setDraftVersion(nextVersion)
      lastSavedNodesRef.current = JSON.stringify(draftNodes)
      setDraftSaveState("saved")
    },
    [canEdit, sharedToken],
  )

  const flushSaveQueue = useCallback(async () => {
    if (saveInFlightRef.current) return
    if (!queuedNodesRef.current) return

    saveInFlightRef.current = true

    while (queuedNodesRef.current) {
      const nextNodes = queuedNodesRef.current
      queuedNodesRef.current = null

      try {
        await saveDraft(nextNodes)
      } catch (error) {
        const code = error instanceof Error ? error.message : "save_failed"
        setDraftSaveState("error")
        if (code === "version_conflict") {
          setDraftError("Autosave conflict detected. Keep editing to retry.")
        } else if (code === "save_failed") {
          setDraftError(
            "Autosave failed (server error). Keep editing to retry.",
          )
        } else {
          setDraftError("Autosave failed. Keep editing to retry.")
        }
        saveInFlightRef.current = false
        return
      }
    }

    saveInFlightRef.current = false
  }, [saveDraft])

  const enqueueAutosave = useCallback(
    (draftNodes: CanvasNode[]) => {
      queuedNodesRef.current = draftNodes
      void flushSaveQueue()
    },
    [flushSaveQueue],
  )

  const claimDraft = useCallback(async () => {
    if (!isSignedIn) return

    setShareClaimState("claiming")
    setShareMessage(null)

    try {
      const response = await fetch("/draft/claim", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "X-CSRF-Token": csrfToken(),
        },
      })

      if (!response.ok) throw new Error("claim_failed")

      const body = (await response.json()) as { status?: string }
      if (body.status === "claimed") {
        setShareClaimState("claimed")
        setShareMessage("Draft claimed to your account.")
      } else if (body.status === "already_claimed") {
        setShareClaimState("claimed")
        setShareMessage("Draft is already attached to your account.")
      } else if (body.status === "no_guest_draft") {
        if (draftVersion > 0) {
          setShareClaimState("claimed")
          setShareMessage("Draft is already attached to your account.")
        } else {
          setShareClaimState("idle")
          setShareMessage("No guest draft to claim.")
        }
      } else {
        setShareClaimState("error")
        setShareMessage("Could not claim draft.")
      }
    } catch {
      setShareClaimState("error")
      setShareMessage("Could not claim draft.")
    } finally {
      const url = new URL(window.location.href)
      let changed = false
      if (url.searchParams.has("claim_draft")) {
        url.searchParams.delete("claim_draft")
        changed = true
      }
      if (url.searchParams.has("open_share")) {
        url.searchParams.delete("open_share")
        changed = true
      }
      if (changed) {
        window.history.replaceState({}, "", `${url.pathname}${url.search}`)
      }
    }
  }, [draftVersion, isSignedIn])

  const createShareLinkAndPermissions = useCallback(async () => {
    if (!isSignedIn) return

    setShareUpdating(true)
    setShareMessage(null)
    try {
      const response = await fetch("/draft/share", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "X-CSRF-Token": csrfToken(),
        },
      })
      const body = await parseJsonSafe(response)
      if (!response.ok) {
        setShareMessage("Could not create share link.")
        return
      }

      const link = typeof body.share_url === "string" ? body.share_url : null
      const permission = body.permission === "edit" ? "edit" : "view"
      setShareUrl(link)
      setSharePermission(permission)
      setShareMessage(link ? "Share link ready." : "Share link created.")
    } catch {
      setShareMessage("Could not create share link.")
    } finally {
      setShareUpdating(false)
    }
  }, [isSignedIn])

  const updateSharePermission = useCallback(
    async (permission: SharePermission) => {
      if (!isSignedIn || !shareUrl) return

      setShareUpdating(true)
      setShareMessage(null)
      try {
        const response = await fetch("/draft/share_settings", {
          method: "PATCH",
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken(),
          },
          body: JSON.stringify({ permission }),
        })

        const body = await parseJsonSafe(response)
        if (!response.ok) {
          setShareMessage("Could not update share permission.")
          return
        }

        const nextPermission = body.permission === "edit" ? "edit" : "view"
        setSharePermission(nextPermission)
        setShareMessage(`Share permission set to ${nextPermission}.`)
      } catch {
        setShareMessage("Could not update share permission.")
      } finally {
        setShareUpdating(false)
      }
    },
    [isSignedIn, shareUrl],
  )

  const startShareFlow = useCallback(() => {
    if (!isSignedIn) {
      const returnTo = new URL(window.location.href)
      returnTo.searchParams.set("claim_draft", "1")
      returnTo.searchParams.set("open_share", "1")

      const signInUrl = new URL("/sign_in", window.location.origin)
      signInUrl.searchParams.set(
        "return_to",
        `${returnTo.pathname}${returnTo.search}`,
      )

      window.location.assign(signInUrl.toString())
      return
    }

    void createShareLinkAndPermissions()
  }, [createShareLinkAndPermissions, isSignedIn])

  useEffect(() => {
    let cancelled = false

    const controller = new AbortController()

    async function loadDraft() {
      try {
        const query = sharedToken
          ? `?share_token=${encodeURIComponent(sharedToken)}`
          : ""
        const response = await fetch(`/draft${query}`, {
          method: "GET",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error("load_failed")
        }

        const body = (await response.json()) as {
          nodes?: unknown
          version?: number
          permission?: SharePermission
        }
        const nextNodes = Array.isArray(body.nodes)
          ? body.nodes.filter(isCanvasNode)
          : []
        const nextVersion = typeof body.version === "number" ? body.version : 0

        if (cancelled) return

        setNodes(nextNodes)
        setSelectedId(null)
        setSelectedIds([])
        if (isSharedView && body.permission) {
          setCurrentSharedPermission(body.permission)
        }
        draftVersionRef.current = nextVersion
        setDraftVersion(nextVersion)
        lastSavedNodesRef.current = JSON.stringify(nextNodes)
        setDraftSaveState(nextNodes.length > 0 ? "saved" : "idle")
      } catch {
        if (cancelled) return
        setDraftSaveState("error")
        setDraftError("Could not load cloud draft.")
      } finally {
        if (!cancelled) {
          setDraftLoaded(true)
        }
      }
    }

    void loadDraft()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [isSharedView, sharedToken])

  useEffect(() => {
    if (!canEdit && canvasViewMode !== "preview") {
      setCanvasViewMode("preview")
    }
    if (!canEdit) {
      setPlacementState(null)
      setArmedPrimitiveKind(null)
    }
  }, [canEdit, canvasViewMode])

  useEffect(() => {
    if (!draftLoaded) return
    if (!canEdit) return

    const serialized = JSON.stringify(nodes)
    if (serialized === lastSavedNodesRef.current) return

    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current)
    }

    autosaveTimerRef.current = window.setTimeout(() => {
      enqueueAutosave(nodes)
    }, AUTOSAVE_DEBOUNCE_MS)

    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current)
      }
    }
  }, [canEdit, draftLoaded, enqueueAutosave, nodes])

  useEffect(() => {
    if (!isSignedIn) return
    const params = new URLSearchParams(window.location.search)
    const needsClaim = params.get("claim_draft") === "1"
    const shouldOpenShare = params.get("open_share") === "1"

    async function run() {
      if (needsClaim) {
        await claimDraft()
      }
      if (shouldOpenShare) {
        await createShareLinkAndPermissions()
      }
    }

    if (needsClaim || shouldOpenShare) {
      void run()
    }
  }, [claimDraft, createShareLinkAndPermissions, isSignedIn])

  useEffect(() => {
    if (!editingId) return
    if (!nodes.some((node) => node.id === editingId)) {
      setEditingId(null)
    }
  }, [editingId, nodes])

  useEffect(() => {
    if (selectedIds.length === 0) {
      if (selectedId !== null) setSelectedId(null)
      return
    }

    const selectedSet = new Set(selectedIds)
    const nextSelectedIds = selectedIds.filter((id) =>
      nodes.some((node) => node.id === id),
    )
    if (nextSelectedIds.length !== selectedIds.length) {
      setSelectedIds(nextSelectedIds)
    }

    if (!selectedId || !selectedSet.has(selectedId)) {
      setSelectedId(nextSelectedIds[0] ?? null)
    }
  }, [nodes, selectedId, selectedIds])

  useEffect(() => {
    function updateCanvasSize() {
      const viewport = canvasViewportRef.current
      const charProbe = charProbeRef.current
      if (!viewport || !charProbe) return

      const styles = window.getComputedStyle(viewport)
      const paddingLeft = Number.parseFloat(styles.paddingLeft || "0")
      const paddingRight = Number.parseFloat(styles.paddingRight || "0")
      const paddingTop = Number.parseFloat(styles.paddingTop || "0")
      const paddingBottom = Number.parseFloat(styles.paddingBottom || "0")
      const usableWidth = viewport.clientWidth - paddingLeft - paddingRight
      const usableHeight = viewport.clientHeight - paddingTop - paddingBottom
      const charWidth = charProbe.getBoundingClientRect().width
      if (!Number.isFinite(charWidth) || charWidth <= 0) return

      setCharWidthPx(charWidth)
      const nextWidth = Math.max(64, Math.floor(usableWidth / charWidth))
      const nextHeight = Math.max(
        24,
        Math.floor(usableHeight / ASCII_LINE_HEIGHT_PX),
      )
      setCanvasWidth(nextWidth)
      setCanvasHeight(nextHeight)
    }

    updateCanvasSize()

    const viewport = canvasViewportRef.current
    if (!viewport) return

    const observer = new ResizeObserver(() => updateCanvasSize())
    observer.observe(viewport)

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    function onPointerMove(event: PointerEvent) {
      if (dragStateRef.current) {
        applyDragDelta(event.clientX, event.clientY)
      }

      const activePlacement = placementState
      const canvas = canvasFrameRef.current
      if (activePlacement && canvas) {
        const point = getGridPointFromPointer(
          event,
          canvas,
          charWidthPx,
          canvasWidth,
          canvasHeight,
        )
        setPlacementState((current) => {
          if (current?.kind !== activePlacement.kind) return current
          if (
            current.currentX === point.gridX &&
            current.currentY === point.gridY
          ) {
            return current
          }
          return {
            ...current,
            currentX: point.gridX,
            currentY: point.gridY,
          }
        })
      }

      const lasso = lassoStateRef.current
      if (!lasso || !canvas) return

      const rect = canvas.getBoundingClientRect()
      const currentX = clamp(event.clientX - rect.left, 0, rect.width)
      const currentY = clamp(event.clientY - rect.top, 0, rect.height)
      const x = Math.min(lasso.startX, currentX)
      const y = Math.min(lasso.startY, currentY)
      const w = Math.abs(currentX - lasso.startX)
      const h = Math.abs(currentY - lasso.startY)
      setLassoRect({ x, y, w, h })
    }

    function onPointerUp() {
      dragStateRef.current = null

      const lasso = lassoStateRef.current
      const nextLassoRect = lassoRect
      lassoStateRef.current = null
      if (!lasso || !nextLassoRect) {
        setLassoRect(null)
        return
      }

      const lassoLeft = nextLassoRect.x
      const lassoTop = nextLassoRect.y
      const lassoRight = lassoLeft + nextLassoRect.w
      const lassoBottom = lassoTop + nextLassoRect.h
      const hitIds = normalizeNodes(nodes, {
        width: canvasWidth,
        height: canvasHeight,
      })
        .filter((node) => {
          const nodeLeft = node.x * charWidthPx
          const nodeTop = node.y * ASCII_LINE_HEIGHT_PX
          const nodeRight = nodeLeft + node.w * charWidthPx
          const nodeBottom = nodeTop + node.h * ASCII_LINE_HEIGHT_PX
          return !(
            nodeRight < lassoLeft ||
            nodeLeft > lassoRight ||
            nodeBottom < lassoTop ||
            nodeTop > lassoBottom
          )
        })
        .map((node) => node.id)

      setSelectedIds((current) => {
        const next = lasso.additive
          ? Array.from(new Set([...current, ...hitIds]))
          : hitIds
        setSelectedId(next[0] ?? null)
        return next
      })
      setLassoRect(null)
    }

    window.addEventListener("pointermove", onPointerMove)
    window.addEventListener("pointerup", onPointerUp)
    window.addEventListener("pointercancel", onPointerUp)

    return () => {
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("pointerup", onPointerUp)
      window.removeEventListener("pointercancel", onPointerUp)
    }
  }, [
    applyDragDelta,
    canvasHeight,
    canvasWidth,
    charWidthPx,
    lassoRect,
    nodes,
    placementState,
  ])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (canvasViewMode === "preview") return

      const target = event.target
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)

      if (isTypingTarget) return

      if (event.key === "Escape" && armedPrimitiveKind) {
        setPlacementState(null)
        setArmedPrimitiveKind(null)
        setShowAllPrimitives(false)
        return
      }

      if (event.key !== "Delete" && event.key !== "Backspace") return
      if (selectedIds.length === 0) return

      event.preventDefault()
      deleteSelectedNode()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [
    armedPrimitiveKind,
    canvasViewMode,
    deleteSelectedNode,
    selectedIds.length,
  ])

  const asciiPreview = useMemo(
    () => renderAscii(nodes, { width: canvasWidth, height: canvasHeight }),
    [canvasHeight, canvasWidth, nodes],
  )
  const markdownExport = useMemo(
    () => renderMarkdown(nodes, { width: canvasWidth, height: canvasHeight }),
    [canvasHeight, canvasWidth, nodes],
  )
  const displayNodes = useMemo(
    () => normalizeNodes(nodes, { width: canvasWidth, height: canvasHeight }),
    [canvasHeight, canvasWidth, nodes],
  )
  const placementPreviewNode = useMemo(() => {
    if (!armedPrimitiveKind || !placementState) return null
    if (placementState.kind !== armedPrimitiveKind) return null
    return createNodeFromPrimitive(
      armedPrimitiveKind,
      nodes,
      canvasWidth,
      canvasHeight,
      placementState.startX,
      placementState.startY,
      placementState.currentX,
      placementState.currentY,
    )
  }, [armedPrimitiveKind, canvasHeight, canvasWidth, nodes, placementState])
  const primaryPrimitives = useMemo(
    () =>
      PRIMITIVES.filter((primitive) =>
        PRIMARY_PRIMITIVE_KINDS.includes(primitive.kind),
      ),
    [],
  )
  const secondaryPrimitives = useMemo(
    () =>
      PRIMITIVES.filter(
        (primitive) => !PRIMARY_PRIMITIVE_KINDS.includes(primitive.kind),
      ),
    [],
  )

  return (
    <>
      <Head title="¯\\_(ツ)_/¯" />

      <div className={`${designClasses.page} ds-workspace !p-0`}>
        <div className="ds-floating-topbar">
          <div className="flex items-center gap-3 text-[var(--app-ink)]">
            <AppLogoIcon className="h-7 w-auto md:h-8" />
            <div className="leading-tight">
              <p className="text-[10px] font-bold tracking-[0.2em] text-[var(--app-muted)] uppercase">
                asciify
              </p>
              <p className="text-sm font-medium tracking-tight text-[var(--app-muted)]">
                text to ascii converter
              </p>
            </div>
          </div>

          <nav className="flex items-center gap-2">
            {!isSharedView && (
              <Button
                type="button"
                variant="outline"
                className={`gap-2 ${designClasses.buttonSoft}`}
                onClick={startShareFlow}
                disabled={shareClaimState === "claiming" || shareUpdating}
              >
                <Share2 className="size-4" />
                {shareClaimState === "claiming"
                  ? "Claiming..."
                  : shareUpdating
                    ? "Sharing..."
                    : "Share"}
              </Button>
            )}
            {auth.user ? (
              <Link href={dashboardPath()}>
                <Button
                  variant="outline"
                  className={`gap-2 ${designClasses.buttonSoft}`}
                >
                  <LayoutDashboard className="size-4" />
                  Dashboard
                </Button>
              </Link>
            ) : (
              <Link href={signInPath()}>
                <Button
                  variant="outline"
                  className={`gap-2 ${designClasses.buttonSoft}`}
                >
                  <LogIn className="size-4" />
                  Sign in
                </Button>
              </Link>
            )}
          </nav>
        </div>

        {[isSharedView, shareUrl, shareMessage].some(Boolean) && (
          <div className="ds-share-panel">
            {isSharedView && (
              <p className="text-xs text-[var(--app-muted)]">
                Shared link mode:{" "}
                {currentSharedPermission === "edit" ? "Can edit" : "View only"}
              </p>
            )}
            {shareUrl && (
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  readOnly
                  value={shareUrl}
                  className="h-8 min-w-[280px] flex-1 border-[var(--line)] bg-[color-mix(in_oklab,var(--surface-1)_92%,white_8%)]"
                />
                <Button
                  type="button"
                  variant="outline"
                  className={`h-8 ${designClasses.buttonSoft}`}
                  onClick={() => void copy(shareUrl)}
                >
                  {copiedValue === shareUrl ? "Copied" : "Copy link"}
                </Button>
                <Button
                  type="button"
                  variant={sharePermission === "view" ? "default" : "outline"}
                  className={`h-8 ${sharePermission === "view" ? "" : designClasses.buttonSoft}`}
                  onClick={() => void updateSharePermission("view")}
                  disabled={shareUpdating}
                >
                  View
                </Button>
                <Button
                  type="button"
                  variant={sharePermission === "edit" ? "default" : "outline"}
                  className={`h-8 ${sharePermission === "edit" ? "" : designClasses.buttonSoft}`}
                  onClick={() => void updateSharePermission("edit")}
                  disabled={shareUpdating}
                >
                  Edit
                </Button>
              </div>
            )}
            {shareMessage && (
              <p className="text-xs text-[var(--app-muted)]">{shareMessage}</p>
            )}
          </div>
        )}

        <main className="ds-canvas-stage !h-screen !min-h-screen md:!h-screen">
          <section className="h-full overflow-hidden bg-[var(--app-bg)]">
            <div
              ref={canvasViewportRef}
              className={`${designClasses.canvasBoard} h-full min-h-[420px] rounded-none border-none p-6 md:p-8 ${
                canvasViewMode === "preview" ? "ds-canvas-board-preview" : ""
              }`}
            >
              <span
                ref={charProbeRef}
                aria-hidden
                className="pointer-events-none absolute top-0 left-0 text-[11px] leading-4 opacity-0"
                style={{ fontFamily: ASCII_FONT_FAMILY, letterSpacing: "0" }}
              >
                M
              </span>
              {canvasViewMode === "preview" ? (
                <div
                  className={`ds-terminal-frame ${previewTheme === "dark" ? "ds-terminal-frame-dark" : "ds-terminal-frame-light"}`}
                >
                  <div className="ds-terminal-chrome">
                    <span className="ds-terminal-dot bg-[#ef4444]" />
                    <span className="ds-terminal-dot bg-[#f59e0b]" />
                    <span className="ds-terminal-dot bg-[#22c55e]" />
                  </div>
                  <div className="ds-terminal-screen">
                    <pre
                      className="m-0 overflow-hidden text-[11px] leading-4 whitespace-pre"
                      style={{
                        fontFamily: ASCII_FONT_FAMILY,
                        letterSpacing: "0",
                        width: `${canvasWidth * charWidthPx}px`,
                        height: `${canvasHeight * ASCII_LINE_HEIGHT_PX}px`,
                      }}
                    >
                      {asciiPreview || "(empty)"}
                    </pre>
                  </div>
                </div>
              ) : (
                <div className="ds-terminal-frame ds-terminal-frame-light">
                  <div className="ds-terminal-chrome">
                    <span className="ds-terminal-dot bg-[#ef4444]" />
                    <span className="ds-terminal-dot bg-[#f59e0b]" />
                    <span className="ds-terminal-dot bg-[#22c55e]" />
                  </div>
                  <div className="ds-terminal-screen">
                    <div
                      className="relative text-[11px] leading-4"
                      style={{
                        fontFamily: ASCII_FONT_FAMILY,
                        letterSpacing: "0",
                        width: `${canvasWidth * charWidthPx}px`,
                        height: `${canvasHeight * ASCII_LINE_HEIGHT_PX}px`,
                      }}
                    >
                      <pre
                        className="pointer-events-none absolute inset-0 m-0 overflow-hidden text-[11px] leading-4 whitespace-pre text-[var(--app-ink)]"
                        style={{
                          fontFamily: ASCII_FONT_FAMILY,
                          letterSpacing: "0",
                        }}
                      >
                        {asciiPreview || "(empty)"}
                      </pre>
                      {canEdit && (
                        <div
                          ref={canvasFrameRef}
                          className="absolute inset-0 cursor-crosshair"
                          onPointerDown={beginLasso}
                        >
                          {displayNodes.map((node) => {
                            const isConnector = isConnectorKind(node.kind)
                            const connectorEnds = isConnector
                              ? getConnectorEndpoints(node)
                              : null
                            return (
                            <div
                              key={node.id}
                              className={`absolute overflow-visible rounded text-center ${
                                isConnector
                                  ? "border border-transparent bg-transparent shadow-none"
                                  : selectedIds.includes(node.id)
                                    ? node.kind === "text"
                                      ? "border-transparent bg-[color-mix(in_oklab,var(--accent)_8%,white_92%)] shadow-none"
                                      : "border border-[color-mix(in_oklab,var(--accent)_62%,var(--line)_38%)] bg-[color-mix(in_oklab,var(--accent)_9%,white_91%)] shadow-[0_0_0_1px_color-mix(in_oklab,var(--accent)_42%,white_58%)]"
                                    : node.kind === "text"
                                      ? "border-transparent bg-transparent"
                                      : "border border-[var(--line)] bg-transparent"
                              }`}
                              style={(() => {
                                const textScale = getNodeTextScale(
                                  node,
                                  charWidthPx,
                                  ASCII_LINE_HEIGHT_PX,
                                )
                                return {
                                  left: `${node.x * charWidthPx}px`,
                                  top: `${node.y * ASCII_LINE_HEIGHT_PX}px`,
                                  width: `${node.w * charWidthPx}px`,
                                  height: `${node.h * ASCII_LINE_HEIGHT_PX}px`,
                                  fontSize: `${textScale.fontSize}px`,
                                  lineHeight: `${textScale.lineHeight}px`,
                                }
                              })()}
                              onClick={(event) => {
                                const isMultiSelect =
                                  event.shiftKey ||
                                  event.metaKey ||
                                  event.ctrlKey
                                if (
                                  event.detail >= 2 &&
                                  selectedId === node.id &&
                                  selectedIds.length === 1
                                ) {
                                  startInlineEdit(node)
                                  return
                                }

                                if (isMultiSelect) {
                                  setEditingId(null)
                                  setSelectedIds((current) => {
                                    if (current.includes(node.id)) {
                                      const next = current.filter(
                                        (id) => id !== node.id,
                                      )
                                      setSelectedId(next[0] ?? null)
                                      return next
                                    }
                                    const next = [...current, node.id]
                                    setSelectedId(node.id)
                                    return next
                                  })
                                  return
                                }

                                setSelectedId(node.id)
                                setSelectedIds([node.id])
                              }}
                              onPointerDown={(event) => {
                                if (
                                  event.shiftKey ||
                                  event.metaKey ||
                                  event.ctrlKey
                                )
                                  return
                                if (event.detail >= 2 && selectedId === node.id)
                                  return
                                beginDrag(event, node, "move")
                              }}
                            >
                              {connectorEnds && (
                                <svg
                                  className="pointer-events-none absolute inset-0 overflow-visible"
                                  viewBox={`0 0 ${Math.max(1, node.w * charWidthPx)} ${Math.max(1, node.h * ASCII_LINE_HEIGHT_PX)}`}
                                  preserveAspectRatio="none"
                                >
                                  <line
                                    x1={(connectorEnds.startX - node.x + 0.5) * charWidthPx}
                                    y1={(connectorEnds.startY - node.y + 0.5) * ASCII_LINE_HEIGHT_PX}
                                    x2={(connectorEnds.endX - node.x + 0.5) * charWidthPx}
                                    y2={(connectorEnds.endY - node.y + 0.5) * ASCII_LINE_HEIGHT_PX}
                                    stroke={
                                      selectedIds.includes(node.id)
                                        ? "color-mix(in oklab, var(--accent) 72%, black 28%)"
                                        : "color-mix(in oklab, var(--line) 68%, black 32%)"
                                    }
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeDasharray={
                                      node.kind === "dashed-line" ||
                                      node.kind === "dashed-arrow" ||
                                      node.kind === "double-arrow"
                                        ? "6 4"
                                        : undefined
                                    }
                                  />
                                  {(node.kind === "arrow" ||
                                    node.kind === "dashed-arrow" ||
                                    node.kind === "double-arrow" ||
                                    node.kind === "bidirectional-connector") && (
                                    <polyline
                                      points={connectorArrowHead(
                                        (connectorEnds.startX - node.x + 0.5) * charWidthPx,
                                        (connectorEnds.startY - node.y + 0.5) * ASCII_LINE_HEIGHT_PX,
                                        (connectorEnds.endX - node.x + 0.5) * charWidthPx,
                                        (connectorEnds.endY - node.y + 0.5) * ASCII_LINE_HEIGHT_PX,
                                      )}
                                      fill="none"
                                      stroke={
                                        selectedIds.includes(node.id)
                                          ? "color-mix(in oklab, var(--accent) 72%, black 28%)"
                                          : "color-mix(in oklab, var(--line) 68%, black 32%)"
                                      }
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                  )}
                                  {(node.kind === "double-arrow" ||
                                    node.kind === "bidirectional-connector") && (
                                    <polyline
                                      points={connectorArrowHead(
                                        (connectorEnds.endX - node.x + 0.5) * charWidthPx,
                                        (connectorEnds.endY - node.y + 0.5) * ASCII_LINE_HEIGHT_PX,
                                        (connectorEnds.startX - node.x + 0.5) * charWidthPx,
                                        (connectorEnds.startY - node.y + 0.5) * ASCII_LINE_HEIGHT_PX,
                                      )}
                                      fill="none"
                                      stroke={
                                        selectedIds.includes(node.id)
                                          ? "color-mix(in oklab, var(--accent) 72%, black 28%)"
                                          : "color-mix(in oklab, var(--line) 68%, black 32%)"
                                      }
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                  )}
                                </svg>
                              )}
                              {selectedNode?.id === node.id &&
                                (editingId === node.id ? (
                                  <div
                                    className="absolute inset-0 z-20 overflow-visible"
                                    onPointerDown={(event) =>
                                      event.stopPropagation()
                                    }
                                    onClick={(event) => event.stopPropagation()}
                                  >
                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                                      <Input
                                        value={editingLabel}
                                        onChange={(event) =>
                                          setEditingLabel(event.target.value)
                                        }
                                        onFocus={(event) =>
                                          event.currentTarget.select()
                                        }
                                        onBlur={commitInlineEdit}
                                        onKeyDown={(event) => {
                                          if (
                                            shouldCommitInlineEditKey(event.key)
                                          ) {
                                            event.preventDefault()
                                            commitInlineEdit()
                                          }
                                        }}
                                        autoFocus
                                        className="min-h-0 border-[var(--line)] bg-[color-mix(in_oklab,var(--surface-1)_95%,white_5%)] px-1.5 py-0 text-left text-[var(--app-ink)]"
                                        style={(() => {
                                          const textScale = getNodeTextScale(
                                            node,
                                            charWidthPx,
                                            ASCII_LINE_HEIGHT_PX,
                                          )
                                          return {
                                            width: `${Math.max(
                                              96,
                                              Math.min(
                                                640,
                                                Math.max(
                                                  node.w * charWidthPx + 12,
                                                  (editingLabel.length + 2) *
                                                    Math.max(charWidthPx, 8),
                                                ),
                                              ),
                                            )}px`,
                                            height: `${Math.max(
                                              24,
                                              textScale.lineHeight + 8,
                                            )}px`,
                                            fontSize: `${textScale.fontSize}px`,
                                            lineHeight: `${textScale.lineHeight}px`,
                                          }
                                        })()}
                                      />
                                    </div>
                                  </div>
                                ) : (
                                  <span
                                    className="absolute top-0 left-0 -translate-y-[110%] rounded border border-[color-mix(in_oklab,var(--accent)_58%,var(--line)_42%)] bg-[var(--surface-1)] px-1.5 py-0.5 font-semibold text-[var(--app-ink)]"
                                    style={(() => {
                                      const textScale = getNodeTextScale(
                                        node,
                                        charWidthPx,
                                        ASCII_LINE_HEIGHT_PX,
                                      )
                                      return {
                                        fontSize: `${textScale.badgeFontSize}px`,
                                        lineHeight: 1,
                                      }
                                    })()}
                                  >
                                    {node.label || node.kind.toUpperCase()}
                                  </span>
                                ))}
                              <span
                                className="absolute right-0 bottom-0 h-3.5 w-3.5 cursor-se-resize rounded-tl border-t border-l border-[color-mix(in_oklab,var(--accent)_65%,var(--line)_35%)] bg-[color-mix(in_oklab,var(--accent)_78%,white_22%)]"
                                style={{
                                  display:
                                    selectedIds.length === 1 &&
                                    selectedIds[0] === node.id &&
                                    !isConnector
                                      ? "block"
                                      : "none",
                                }}
                                onPointerDown={(event) =>
                                  beginDrag(event, node, "resize")
                                }
                              />
                            </div>
                            )
                          })}
                          {placementPreviewNode && (
                            <div
                              className="pointer-events-none absolute overflow-visible rounded border border-dashed border-[color-mix(in_oklab,var(--accent)_68%,var(--line)_32%)] bg-[color-mix(in_oklab,var(--accent)_12%,white_88%)]"
                              style={{
                                left: `${placementPreviewNode.x * charWidthPx}px`,
                                top: `${placementPreviewNode.y * ASCII_LINE_HEIGHT_PX}px`,
                                width: `${placementPreviewNode.w * charWidthPx}px`,
                                height: `${placementPreviewNode.h * ASCII_LINE_HEIGHT_PX}px`,
                                ...(isConnectorKind(placementPreviewNode.kind)
                                  ? {
                                      borderColor: "transparent",
                                      backgroundColor: "transparent",
                                    }
                                  : null),
                              }}
                            >
                              {isConnectorKind(placementPreviewNode.kind) && (
                                <svg
                                  className="absolute inset-0 overflow-visible"
                                  viewBox={`0 0 ${Math.max(1, placementPreviewNode.w * charWidthPx)} ${Math.max(1, placementPreviewNode.h * ASCII_LINE_HEIGHT_PX)}`}
                                  preserveAspectRatio="none"
                                >
                                  {(() => {
                                    const ends =
                                      getConnectorEndpoints(placementPreviewNode)
                                    const startPxX =
                                      (ends.startX - placementPreviewNode.x + 0.5) *
                                      charWidthPx
                                    const startPxY =
                                      (ends.startY - placementPreviewNode.y + 0.5) *
                                      ASCII_LINE_HEIGHT_PX
                                    const endPxX =
                                      (ends.endX - placementPreviewNode.x + 0.5) *
                                      charWidthPx
                                    const endPxY =
                                      (ends.endY - placementPreviewNode.y + 0.5) *
                                      ASCII_LINE_HEIGHT_PX
                                    return (
                                      <>
                                        <line
                                          x1={startPxX}
                                          y1={startPxY}
                                          x2={endPxX}
                                          y2={endPxY}
                                          stroke="color-mix(in oklab, var(--accent) 70%, black 30%)"
                                          strokeWidth="2"
                                          strokeLinecap="round"
                                          strokeDasharray={
                                            placementPreviewNode.kind ===
                                              "dashed-line" ||
                                            placementPreviewNode.kind ===
                                              "dashed-arrow" ||
                                            placementPreviewNode.kind ===
                                              "double-arrow"
                                              ? "6 4"
                                              : undefined
                                          }
                                        />
                                        {(placementPreviewNode.kind === "arrow" ||
                                          placementPreviewNode.kind ===
                                            "dashed-arrow" ||
                                          placementPreviewNode.kind ===
                                            "double-arrow" ||
                                          placementPreviewNode.kind ===
                                            "bidirectional-connector") && (
                                          <polyline
                                            points={connectorArrowHead(
                                              startPxX,
                                              startPxY,
                                              endPxX,
                                              endPxY,
                                            )}
                                            fill="none"
                                            stroke="color-mix(in oklab, var(--accent) 70%, black 30%)"
                                            strokeWidth="2"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                          />
                                        )}
                                        {(placementPreviewNode.kind ===
                                          "double-arrow" ||
                                          placementPreviewNode.kind ===
                                            "bidirectional-connector") && (
                                          <polyline
                                            points={connectorArrowHead(
                                              endPxX,
                                              endPxY,
                                              startPxX,
                                              startPxY,
                                            )}
                                            fill="none"
                                            stroke="color-mix(in oklab, var(--accent) 70%, black 30%)"
                                            strokeWidth="2"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                          />
                                        )}
                                      </>
                                    )
                                  })()}
                                </svg>
                              )}
                            </div>
                          )}
                          {lassoRect && (
                            <div
                              className="pointer-events-none absolute border border-dashed border-[var(--line)] bg-[color-mix(in_oklab,var(--accent)_10%,white_90%)]"
                              style={{
                                left: `${lassoRect.x}px`,
                                top: `${lassoRect.y}px`,
                                width: `${lassoRect.w}px`,
                                height: `${lassoRect.h}px`,
                              }}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        </main>

        <div className="ds-toolbar-dock">
          <div className="ds-toolbar-group">
            {primaryPrimitives.map((primitive) => (
              <Button
                key={primitive.kind}
                type="button"
                variant="outline"
                className={`ds-tool-btn ${armedPrimitiveKind === primitive.kind ? "ds-tool-btn-active" : ""}`}
                onClick={() => armPrimitive(primitive.kind)}
                disabled={!canEdit}
                aria-label={`Add ${primitive.name}`}
                title={primitive.name}
              >
                <PrimitiveGlyph kind={primitive.kind} className="size-5" />
              </Button>
            ))}
            <div className="relative">
              <Button
                type="button"
                variant="outline"
                className={`ds-tool-btn ${showAllPrimitives ? "ds-tool-btn-active" : ""}`}
                onClick={() => setShowAllPrimitives((current) => !current)}
                disabled={!canEdit}
                aria-label="More shapes"
                title="More shapes"
              >
                <MoreHorizontal className="size-5" />
              </Button>
              {showAllPrimitives && (
                <div className="ds-popover-panel">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[11px] font-semibold tracking-[0.12em] uppercase">
                      More Shapes
                    </p>
                    <ChevronDown className="size-4" />
                  </div>
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                    {secondaryPrimitives.map((primitive) => (
                      <Button
                        key={primitive.kind}
                        type="button"
                        variant="outline"
                        className={`ds-tool-btn ${armedPrimitiveKind === primitive.kind ? "ds-tool-btn-active" : ""}`}
                        onClick={() => {
                          armPrimitive(primitive.kind)
                        }}
                        disabled={!canEdit}
                        aria-label={`Add ${primitive.name}`}
                        title={primitive.name}
                      >
                        <PrimitiveGlyph
                          kind={primitive.kind}
                          className="size-5"
                        />
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="ds-toolbar-group">
            <Button
              className="ds-tool-btn ds-tool-btn-strong"
              onClick={() => void copy(markdownExport)}
              aria-label={
                copiedValue === markdownExport
                  ? "Copied markdown"
                  : "Copy markdown"
              }
              title={
                copiedValue === markdownExport
                  ? "Copied markdown"
                  : "Copy markdown"
              }
            >
              <Copy className="size-5" />
            </Button>
            <Button
              type="button"
              variant="outline"
              className="ds-tool-btn"
              onClick={() => downloadMarkdown(markdownExport)}
              aria-label="Download markdown"
              title="Download markdown"
            >
              <Download className="size-5" />
            </Button>
            <Button
              type="button"
              variant="outline"
              className="ds-tool-btn"
              onClick={deleteSelectedNode}
              disabled={
                selectedIds.length === 0 ||
                canvasViewMode === "preview" ||
                !canEdit
              }
              aria-label="Delete selected block"
              title="Delete selected block"
            >
              <Trash2 className="size-5" />
            </Button>
            <Button
              type="button"
              variant="outline"
              className="ds-tool-btn"
              onClick={clearCanvas}
              disabled={
                nodes.length === 0 || canvasViewMode === "preview" || !canEdit
              }
              aria-label="Clear canvas"
              title="Clear canvas"
            >
              <Eraser className="size-5" />
            </Button>
          </div>

          <div className="ds-toolbar-group">
            <Button
              type="button"
              variant="outline"
              className={`ds-tool-btn ${canvasViewMode === "preview" ? "ds-tool-btn-active" : ""}`}
              onClick={() =>
                setCanvasViewMode((current) =>
                  current === "edit" ? "preview" : "edit",
                )
              }
              aria-pressed={canvasViewMode === "preview"}
              disabled={!canEdit}
              title={
                canvasViewMode === "preview"
                  ? "Switch to edit mode"
                  : "Switch to preview mode"
              }
            >
              <Eye className="size-5" />
            </Button>
            <Button
              type="button"
              variant="outline"
              className={`ds-tool-btn ${canvasViewMode === "preview" && previewTheme === "dark" ? "ds-tool-btn-active" : ""}`}
              onClick={() =>
                setPreviewTheme((current) =>
                  current === "dark" ? "light" : "dark",
                )
              }
              aria-pressed={
                canvasViewMode === "preview" && previewTheme === "dark"
              }
              disabled={canvasViewMode !== "preview"}
              title={
                previewTheme === "dark"
                  ? "Switch preview to light mode"
                  : "Switch preview to dark mode"
              }
            >
              {previewTheme === "dark" ? (
                <Moon className="size-5" />
              ) : (
                <Sun className="size-5" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
