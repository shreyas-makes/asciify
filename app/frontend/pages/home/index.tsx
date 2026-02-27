import { Head, Link, usePage } from "@inertiajs/react"
import {
  Copy,
  Download,
  Eraser,
  Eye,
  LayoutDashboard,
  LogIn,
  Share2,
  Trash2,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { designClasses } from "@/design-system"
import { useClipboard } from "@/hooks/use-clipboard"
import { normalizeNodes } from "@/lib/ascii/normalize"
import { renderAscii, renderMarkdown } from "@/lib/ascii/render"
import type { CanvasNode, PrimitiveKind } from "@/lib/ascii/types"
import { dashboardPath, signInPath } from "@/routes"
import type { SharedProps } from "@/types"

const DEFAULT_CANVAS_WIDTH = 88
const DEFAULT_CANVAS_HEIGHT = 34
const ASCII_LINE_HEIGHT_PX = 16
const AUTOSAVE_DEBOUNCE_MS = 600
const MIN_NODE_WIDTH = 4
const MIN_NODE_HEIGHT = 1
const DRAG_THRESHOLD_PX = 4
const ASCII_FONT_SIZE_PX = 11
const ASCII_FONT_FAMILY =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'

type DraftSaveState = "idle" | "saving" | "saved" | "error"
type ShareClaimState = "idle" | "claiming" | "claimed" | "error"
type DragMode = "move" | "resize"
type CanvasViewMode = "edit" | "preview"
type SharePermission = "view" | "edit"

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
  { kind: "bidirectional-connector", name: "Double Arrow", defaultLabel: "", w: 14, h: 1 },
  { kind: "double-arrow", name: "Dashed Double", defaultLabel: "", w: 14, h: 1 },
  { kind: "junction", name: "Junction", defaultLabel: "Junction", w: 5, h: 5 },
  { kind: "decision", name: "Decision", defaultLabel: "Decision", w: 11, h: 7 },
  { kind: "io", name: "IO", defaultLabel: "IO", w: 16, h: 4 },
  { kind: "document", name: "Doc", defaultLabel: "Doc", w: 16, h: 5 },
  { kind: "storage", name: "Store", defaultLabel: "Store", w: 16, h: 6 },
  { kind: "swimlane-separator", name: "Lane", defaultLabel: "Lane", w: 24, h: 1 },
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

function nextId(nodes: CanvasNode[]) {
  const maxId = nodes.reduce((max, node) => {
    const value = Number(node.id.replace("node-", ""))
    return Number.isFinite(value) ? Math.max(max, value) : max
  }, 0)
  return `node-${maxId + 1}`
}

function createNodeFromPrimitive(
  kind: PrimitiveKind,
  nodes: CanvasNode[],
  canvasWidth: number,
  canvasHeight: number,
): CanvasNode {
  const primitive = PRIMITIVES.find((item) => item.kind === kind)
  if (!primitive) {
    throw new Error(`Unknown primitive kind: ${kind}`)
  }

  const offset = nodes.length

  return {
    id: nextId(nodes),
    kind,
    label: primitive.defaultLabel,
    x: clamp(2 + (offset % 8) * 3, 0, Math.max(0, canvasWidth - primitive.w)),
    y: clamp(2 + (offset % 6) * 2, 0, Math.max(0, canvasHeight - primitive.h)),
    w: primitive.w,
    h: primitive.h,
    z: offset + 1,
  }
}

function clamp(value: number, min: number, max: number) {
  if (value < min) return min
  if (value > max) return max
  return value
}

function PrimitiveGlyph({ kind, className }: { kind: PrimitiveKind; className?: string }) {
  const base = "stroke-current fill-none"

  switch (kind) {
    case "button":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
          <rect x="4" y="7" width="16" height="10" rx="2.5" className={base} strokeWidth="2" />
        </svg>
      )
    case "input":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
          <rect x="3.5" y="5" width="17" height="14" rx="2" className={base} strokeWidth="2" />
          <line x1="6.5" y1="10" x2="17.5" y2="10" className={base} strokeWidth="2" />
          <line x1="6.5" y1="14" x2="14.5" y2="14" className={base} strokeWidth="2" />
        </svg>
      )
    case "card":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
          <rect x="4" y="4.5" width="16" height="15" rx="2" className={base} strokeWidth="2" />
          <line x1="6.5" y1="9" x2="17.5" y2="9" className={base} strokeWidth="2" />
          <line x1="6.5" y1="12.5" x2="14.5" y2="12.5" className={base} strokeWidth="2" />
        </svg>
      )
    case "modal":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
          <rect x="3" y="4" width="18" height="16" rx="2" className={base} strokeWidth="2" />
          <line x1="3" y1="9" x2="21" y2="9" className={base} strokeWidth="2" />
          <rect x="6.5" y="12" width="11" height="5" rx="1" className={base} strokeWidth="2" />
        </svg>
      )
    case "nav":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
          <rect x="4" y="5" width="4.5" height="4.5" rx="1" className={base} strokeWidth="2" />
          <rect x="10.75" y="5" width="9.25" height="4.5" rx="1" className={base} strokeWidth="2" />
          <rect x="4" y="12" width="4.5" height="7" rx="1" className={base} strokeWidth="2" />
          <rect x="10.75" y="12" width="9.25" height="7" rx="1" className={base} strokeWidth="2" />
        </svg>
      )
    case "text":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
          <line x1="5" y1="6" x2="19" y2="6" className={base} strokeWidth="2" />
          <line x1="12" y1="6" x2="12" y2="18" className={base} strokeWidth="2" />
          <line x1="8.5" y1="18" x2="15.5" y2="18" className={base} strokeWidth="2" />
        </svg>
      )
    case "line":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
          <line x1="4" y1="12" x2="20" y2="12" className={base} strokeWidth="2" />
        </svg>
      )
    case "arrow":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
          <line x1="4" y1="12" x2="18" y2="12" className={base} strokeWidth="2" />
          <polyline points="14,8 18,12 14,16" className={base} strokeWidth="2" />
        </svg>
      )
    case "dashed-line":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
          <line x1="4" y1="12" x2="20" y2="12" className={base} strokeWidth="2" strokeDasharray="3 2" />
        </svg>
      )
    case "dashed-arrow":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
          <line x1="4" y1="12" x2="18" y2="12" className={base} strokeWidth="2" strokeDasharray="3 2" />
          <polyline points="14,8 18,12 14,16" className={base} strokeWidth="2" />
        </svg>
      )
    case "double-arrow":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
          <line x1="5" y1="12" x2="19" y2="12" className={base} strokeWidth="2" strokeDasharray="3 2" />
          <polyline points="8,8 4,12 8,16" className={base} strokeWidth="2" />
          <polyline points="16,8 20,12 16,16" className={base} strokeWidth="2" />
        </svg>
      )
    case "bidirectional-connector":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
          <line x1="5" y1="12" x2="19" y2="12" className={base} strokeWidth="2" />
          <polyline points="8,8 4,12 8,16" className={base} strokeWidth="2" />
          <polyline points="16,8 20,12 16,16" className={base} strokeWidth="2" />
        </svg>
      )
    case "junction":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
          <line x1="4" y1="12" x2="20" y2="12" className={base} strokeWidth="2" />
          <line x1="12" y1="4" x2="12" y2="20" className={base} strokeWidth="2" />
          <circle cx="12" cy="12" r="1.6" className="fill-current" />
        </svg>
      )
    case "decision":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
          <polygon points="12,4 20,12 12,20 4,12" className={base} strokeWidth="2" />
        </svg>
      )
    case "io":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
          <polygon points="7,5 21,5 17,19 3,19" className={base} strokeWidth="2" />
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
          <ellipse cx="12" cy="6.5" rx="6.5" ry="2.5" className={base} strokeWidth="2" />
          <path d="M5.5 6.5v10c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-10" className={base} strokeWidth="2" />
          <path d="M5.5 11.5c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5" className={base} strokeWidth="2" />
        </svg>
      )
    case "swimlane-separator":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
          <line x1="4" y1="10" x2="20" y2="10" className={base} strokeWidth="2" />
          <line x1="4" y1="14" x2="20" y2="14" className={base} strokeWidth="2" strokeDasharray="2.5 2" />
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
          <line x1="9" y1="7.5" x2="19" y2="7.5" className={base} strokeWidth="2" />
          <line x1="9" y1="12" x2="19" y2="12" className={base} strokeWidth="2" />
          <line x1="9" y1="16.5" x2="19" y2="16.5" className={base} strokeWidth="2" />
        </svg>
      )
    default:
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
          <rect x="4" y="7" width="16" height="10" rx="2.5" className={base} strokeWidth="2" />
        </svg>
      )
  }
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

async function parseJsonSafe(response: Response): Promise<Record<string, unknown>> {
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
  const sharedToken = typeof page.props.sharedToken === "string" ? page.props.sharedToken : null
  const initialSharedPermission = page.props.sharedPermission === "edit" ? "edit" : "view"
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
  const [shareClaimState, setShareClaimState] = useState<ShareClaimState>("idle")
  const [shareMessage, setShareMessage] = useState<string | null>(null)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [sharePermission, setSharePermission] = useState<SharePermission | null>(null)
  const [currentSharedPermission, setCurrentSharedPermission] = useState<SharePermission>(initialSharedPermission)
  const [shareUpdating, setShareUpdating] = useState(false)
  const [canvasViewMode, setCanvasViewMode] = useState<CanvasViewMode>(
    isSharedView && initialSharedPermission === "view" ? "preview" : "edit",
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
  const [canvasHeight] = useState(DEFAULT_CANVAS_HEIGHT)
  const [charWidthPx, setCharWidthPx] = useState(8)
  const [lassoRect, setLassoRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)

  function placeOrSelectNode(kind: PrimitiveKind) {
    setNodes((current) => {
      const node = createNodeFromPrimitive(kind, current, canvasWidth, canvasHeight)
      setSelectedId(node.id)
      setSelectedIds([node.id])
      setEditingId(null)
      return [...current, node]
    })
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
              label: nextLabel.length > 0 || OPTIONAL_LABEL_KINDS.has(node.kind) ? nextLabel : node.label,
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

  const updateNodeGeometry = useCallback((nodeId: string, updates: Partial<CanvasNode>) => {
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
  }, [canvasHeight, canvasWidth])

  const beginDrag = useCallback(
    (event: React.PointerEvent<HTMLElement>, node: CanvasNode, mode: DragMode) => {
      if (event.button !== 0) return
      if (mode === "resize") {
        event.preventDefault()
        event.stopPropagation()
      }

      const isNodeInSelection = selectedIds.includes(node.id)
      const moveNodeIds = mode === "move" ? (isNodeInSelection ? selectedIds : [node.id]) : [node.id]
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

            return {
              ...node,
              x: nextX,
              y: nextY,
              w: clamp(node.w, MIN_NODE_WIDTH, maxWidth),
              h: clamp(node.h, MIN_NODE_HEIGHT, maxHeight),
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

  const beginLasso = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    if (event.target !== event.currentTarget) return

    const canvas = canvasFrameRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const startX = clamp(event.clientX - rect.left, 0, rect.width)
    const startY = clamp(event.clientY - rect.top, 0, rect.height)
    const additive = event.shiftKey || event.metaKey || event.ctrlKey

    lassoStateRef.current = { startX, startY, additive }
    setLassoRect({ x: startX, y: startY, w: 0, h: 0 })
    setEditingId(null)
    if (!additive) {
      setSelectedId(null)
      setSelectedIds([])
    }
  }, [])

  const saveDraft = useCallback(async (draftNodes: CanvasNode[]) => {
    if (!canEdit) return

    const query = sharedToken ? `?share_token=${encodeURIComponent(sharedToken)}` : ""
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
    const errorCode = typeof body.error === "string" ? body.error : "save_failed"
    const responseVersion = typeof body.version === "number" ? body.version : null

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

    const nextVersion = typeof responseVersion === "number" ? responseVersion : draftVersionRef.current
    draftVersionRef.current = nextVersion
    setDraftVersion(nextVersion)
    lastSavedNodesRef.current = JSON.stringify(draftNodes)
    setDraftSaveState("saved")
  }, [canEdit, sharedToken])

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
          setDraftError("Autosave failed (server error). Keep editing to retry.")
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
          body: JSON.stringify({permission}),
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
      signInUrl.searchParams.set("return_to", `${returnTo.pathname}${returnTo.search}`)

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
        const query = sharedToken ? `?share_token=${encodeURIComponent(sharedToken)}` : ""
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
        const nextNodes = Array.isArray(body.nodes) ? body.nodes.filter(isCanvasNode) : []
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
    const nextSelectedIds = selectedIds.filter((id) => nodes.some((node) => node.id === id))
    if (nextSelectedIds.length !== selectedIds.length) {
      setSelectedIds(nextSelectedIds)
    }

    if (!selectedId || !selectedSet.has(selectedId)) {
      setSelectedId(nextSelectedIds[0] ?? null)
    }
  }, [nodes, selectedId, selectedIds])

  useEffect(() => {
    function updateCanvasWidth() {
      const viewport = canvasViewportRef.current
      const charProbe = charProbeRef.current
      if (!viewport || !charProbe) return

      const styles = window.getComputedStyle(viewport)
      const paddingLeft = Number.parseFloat(styles.paddingLeft || "0")
      const paddingRight = Number.parseFloat(styles.paddingRight || "0")
      const usableWidth = viewport.clientWidth - paddingLeft - paddingRight
      const charWidth = charProbe.getBoundingClientRect().width
      if (!Number.isFinite(charWidth) || charWidth <= 0) return

      setCharWidthPx(charWidth)
      const nextWidth = Math.max(64, Math.floor(usableWidth / charWidth))
      setCanvasWidth(nextWidth)
    }

    updateCanvasWidth()

    const viewport = canvasViewportRef.current
    if (!viewport) return

    const observer = new ResizeObserver(() => updateCanvasWidth())
    observer.observe(viewport)

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    function onPointerMove(event: PointerEvent) {
      if (dragStateRef.current) {
        applyDragDelta(event.clientX, event.clientY)
      }

      const lasso = lassoStateRef.current
      const canvas = canvasFrameRef.current
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
      const hitIds = normalizeNodes(nodes, { width: canvasWidth, height: canvasHeight })
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
        const next = lasso.additive ? Array.from(new Set([...current, ...hitIds])) : hitIds
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
  }, [applyDragDelta, canvasHeight, canvasWidth, charWidthPx, lassoRect, nodes])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (canvasViewMode === "preview") return

      const target = event.target
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)

      if (isTypingTarget) return
      if (event.key !== "Delete" && event.key !== "Backspace") return
      if (selectedIds.length === 0) return

      event.preventDefault()
      deleteSelectedNode()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [canvasViewMode, deleteSelectedNode, selectedIds.length])

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

  return (
    <>
      <Head title="Asciify V3" />

      <div className={`${designClasses.page} p-4 md:p-6`}>
        <div className="mx-auto flex max-w-7xl flex-col gap-4">
          <header className={`${designClasses.shell} px-5 py-4`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className={designClasses.kicker}>
                  Slice V3
                </p>
                <h1 className="text-3xl font-bold md:text-4xl">Asciify Canvas</h1>
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
                    <Button variant="outline" className="gap-2">
                      <LayoutDashboard className="size-4" />
                      Dashboard
                    </Button>
                  </Link>
                ) : (
                  <Link href={signInPath()}>
                    <Button variant="outline" className="gap-2">
                      <LogIn className="size-4" />
                      Sign in
                    </Button>
                  </Link>
                )}
              </nav>
            </div>
            {[isSharedView, shareUrl, shareMessage].some(Boolean) && (
              <div className="mt-3 space-y-2">
                {isSharedView && (
                  <p className="text-xs text-[var(--app-muted)]">
                    Shared link mode: {currentSharedPermission === "edit" ? "Can edit" : "View only"}
                  </p>
                )}
                {shareUrl && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Input readOnly value={shareUrl} className="h-8 min-w-[280px] flex-1" />
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
                {shareMessage && <p className="text-xs text-[var(--app-muted)]">{shareMessage}</p>}
              </div>
            )}
          </header>

          <main className="grid gap-4 lg:grid-cols-[300px_minmax(720px,1fr)]">
            <section className={`${designClasses.panel} p-4`}>
              <h2 className={`${designClasses.sectionTitle} mb-3`}>Palette</h2>
              <div className="grid grid-cols-4 gap-2">
                {PRIMITIVES.map((primitive) => {
                  return (
                    <Button
                      key={primitive.kind}
                      variant="outline"
                      className={`h-10 min-w-0 px-0 ${designClasses.buttonSoft}`}
                      onClick={() => placeOrSelectNode(primitive.kind)}
                      disabled={!canEdit}
                      aria-label={`Add ${primitive.name}`}
                      title={primitive.name}
                    >
                      <PrimitiveGlyph kind={primitive.kind} className="size-[18px]" />
                    </Button>
                  )
                })}
              </div>

            </section>

            <section className={`${designClasses.panelStrong} border-white/25 bg-black p-4 text-white`}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Button
                    className="border-white/30 bg-[var(--accent)] text-[var(--accent-ink)] hover:brightness-95"
                    onClick={() => void copy(markdownExport)}
                    aria-label={copiedValue === markdownExport ? "Copied markdown" : "Copy markdown"}
                    title={copiedValue === markdownExport ? "Copied markdown" : "Copy markdown"}
                  >
                    <Copy className="size-4" />
                  </Button>
                  <Button
                    variant="outline"
                    className="border-white/30 bg-black text-white hover:bg-white/10 hover:text-white"
                    onClick={() => downloadMarkdown(markdownExport)}
                    aria-label="Download markdown"
                    title="Download markdown"
                  >
                    <Download className="size-4" />
                  </Button>
                  <Button
                    variant="outline"
                    className="border-white/30 bg-black text-white hover:bg-white/10 hover:text-white disabled:border-white/20 disabled:text-white/35"
                    onClick={deleteSelectedNode}
                    disabled={selectedIds.length === 0 || canvasViewMode === "preview" || !canEdit}
                    aria-label="Delete selected block"
                    title="Delete selected block"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                  <Button
                    variant="outline"
                    className="border-white/30 bg-black text-white hover:bg-white/10 hover:text-white disabled:border-white/20 disabled:text-white/35"
                    onClick={clearCanvas}
                    disabled={nodes.length === 0 || canvasViewMode === "preview" || !canEdit}
                    aria-label="Clear canvas"
                    title="Clear canvas"
                  >
                    <Eraser className="size-4" />
                  </Button>
                </div>
                <Button
                  variant="outline"
                  className={`gap-2 border-white/30 ${
                    canvasViewMode === "preview"
                      ? "bg-white text-black hover:bg-white/90"
                      : "bg-black text-white hover:bg-white/10 hover:text-white"
                  }`}
                  onClick={() => setCanvasViewMode((current) => (current === "edit" ? "preview" : "edit"))}
                  aria-pressed={canvasViewMode === "preview"}
                  disabled={!canEdit}
                >
                  <Eye className="size-4" />
                  {canvasViewMode === "preview" ? "Edit mode" : "ASCII Preview"}
                </Button>
              </div>

              <div className={`${designClasses.canvasWrap} border-white/20 bg-black`}>
                <div
                  ref={canvasViewportRef}
                  className={`${designClasses.canvasBoard} h-[620px] border-white/20 bg-black`}
                >
                  <span
                    ref={charProbeRef}
                    aria-hidden
                    className="pointer-events-none absolute top-0 left-0 opacity-0 text-[11px] leading-4"
                    style={{ fontFamily: ASCII_FONT_FAMILY, letterSpacing: "0" }}
                  >
                    M
                  </span>
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
                      className={`absolute inset-0 m-0 overflow-hidden whitespace-pre text-[11px] leading-4 text-white ${
                        canvasViewMode === "preview" ? "pointer-events-auto" : "pointer-events-none"
                      }`}
                      style={{ fontFamily: ASCII_FONT_FAMILY, letterSpacing: "0" }}
                    >
                      {asciiPreview || "(empty)"}
                    </pre>
                    {canvasViewMode === "edit" && canEdit && (
                      <div
                        ref={canvasFrameRef}
                        className="absolute inset-0 cursor-crosshair"
                        onPointerDown={beginLasso}
                      >
                        {displayNodes.map((node) => (
                          <div
                            key={node.id}
                            className={`absolute overflow-visible rounded border text-center ${
                              selectedIds.includes(node.id)
                                ? "border-white bg-white/10 shadow-[0_0_0_1px_rgba(255,255,255,0.45)]"
                                : "border-white/45 bg-transparent"
                            }`}
                            style={{
                              left: `${node.x * charWidthPx}px`,
                              top: `${node.y * ASCII_LINE_HEIGHT_PX}px`,
                              width: `${node.w * charWidthPx}px`,
                              height: `${node.h * ASCII_LINE_HEIGHT_PX}px`,
                              fontSize: `${ASCII_FONT_SIZE_PX}px`,
                              lineHeight: `${ASCII_LINE_HEIGHT_PX}px`,
                            }}
                            onClick={(event) => {
                              const isMultiSelect = event.shiftKey || event.metaKey || event.ctrlKey
                              if (event.detail >= 2 && selectedId === node.id && selectedIds.length === 1) {
                                startInlineEdit(node)
                                return
                              }

                              if (isMultiSelect) {
                                setEditingId(null)
                                setSelectedIds((current) => {
                                  if (current.includes(node.id)) {
                                    const next = current.filter((id) => id !== node.id)
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
                              if (event.shiftKey || event.metaKey || event.ctrlKey) return
                              if (event.detail >= 2 && selectedId === node.id) return
                              beginDrag(event, node, "move")
                            }}
                          >
                            {selectedNode?.id === node.id &&
                              (editingId === node.id ? (
                                <div
                                  className="absolute inset-0 z-20 flex items-center justify-center px-1"
                                  onPointerDown={(event) => event.stopPropagation()}
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <Input
                                    value={editingLabel}
                                    onChange={(event) => setEditingLabel(event.target.value)}
                                    onFocus={(event) => event.currentTarget.select()}
                                    onBlur={commitInlineEdit}
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter") {
                                        event.preventDefault()
                                        commitInlineEdit()
                                      } else if (event.key === "Escape") {
                                        event.preventDefault()
                                        setEditingId(null)
                                      }
                                    }}
                                    autoFocus
                                    className="w-full border-white/50 bg-black/90 px-1.5 py-0 text-center text-xs text-white"
                                    style={{
                                      height: `${Math.max(14, Math.min(24, node.h * ASCII_LINE_HEIGHT_PX - 2))}px`,
                                    }}
                                  />
                                </div>
                              ) : (
                                <span className="absolute top-0 left-0 -translate-y-[110%] rounded border border-white/45 bg-black px-1.5 py-0.5 text-[10px] leading-none font-semibold text-white">
                                  {node.label || node.kind.toUpperCase()}
                                </span>
                              ))}
                            <span
                              className="absolute right-0 bottom-0 h-3 w-3 cursor-se-resize rounded-tl border-t border-l border-white/45 bg-white/75"
                              style={{
                                display:
                                  selectedIds.length === 1 && selectedIds[0] === node.id ? "block" : "none",
                              }}
                              onPointerDown={(event) => beginDrag(event, node, "resize")}
                            />
                          </div>
                        ))}
                        {lassoRect && (
                          <div
                            className="pointer-events-none absolute border border-dashed border-white/70 bg-white/10"
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
            </section>
          </main>
        </div>
      </div>
    </>
  )
}
