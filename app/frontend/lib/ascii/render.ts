import { normalizeNodes } from "./normalize"
import type { CanvasNode, RenderOptions } from "./types"

function makeGrid(width: number, height: number) {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => " "))
}

function put(grid: string[][], x: number, y: number, char: string) {
  if (y < 0 || y >= grid.length || x < 0 || x >= grid[0].length) return
  grid[y][x] = char
}

function putText(grid: string[][], x: number, y: number, text: string, maxWidth: number) {
  const clipped = text.slice(0, Math.max(0, maxWidth))
  for (let i = 0; i < clipped.length; i += 1) {
    put(grid, x + i, y, clipped[i] ?? " ")
  }
}

function centeredLabel(label: string, width: number) {
  const clipped = label.slice(0, Math.max(0, width))
  const offset = Math.max(0, Math.floor((width - clipped.length) / 2))
  return { clipped, offset }
}

function putCenteredText(grid: string[][], left: number, right: number, y: number, text: string) {
  const width = Math.max(0, right - left + 1)
  if (width === 0) return
  const { clipped, offset } = centeredLabel(text, width)
  putText(grid, left + offset, y, clipped, width)
}

function drawBox(grid: string[][], left: number, right: number, top: number, bottom: number) {
  put(grid, left, top, "+")
  put(grid, right, top, "+")
  put(grid, left, bottom, "+")
  put(grid, right, bottom, "+")
  for (let x = left + 1; x < right; x += 1) {
    put(grid, x, top, "-")
    put(grid, x, bottom, "-")
  }
  for (let y = top + 1; y < bottom; y += 1) {
    put(grid, left, y, "|")
    put(grid, right, y, "|")
  }
}

function connectorEndpoints(node: CanvasNode) {
  if (
    typeof node.startX === "number" &&
    typeof node.startY === "number" &&
    typeof node.endX === "number" &&
    typeof node.endY === "number"
  ) {
    return {
      x1: node.startX,
      y1: node.startY,
      x2: node.endX,
      y2: node.endY,
    }
  }

  if (node.w >= node.h) {
    const y = node.y + Math.floor(node.h / 2)
    return { x1: node.x, y1: y, x2: node.x + node.w - 1, y2: y }
  }

  const x = node.x + Math.floor(node.w / 2)
  return { x1: x, y1: node.y, x2: x, y2: node.y + node.h - 1 }
}

function arrowHeadChar(fromX: number, fromY: number, toX: number, toY: number) {
  const dx = toX - fromX
  const dy = toY - fromY
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? ">" : "<"
  }
  return dy >= 0 ? "v" : "^"
}

function segmentChar(x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1
  const dy = y2 - y1
  if (dx === 0) return "|"
  if (dy === 0) return "-"
  return dx * dy > 0 ? "\\" : "/"
}

function bresenhamPoints(x1: number, y1: number, x2: number, y2: number) {
  const points: { x: number; y: number }[] = []
  let x = x1
  let y = y1
  const dx = Math.abs(x2 - x1)
  const dy = Math.abs(y2 - y1)
  const sx = x1 < x2 ? 1 : -1
  const sy = y1 < y2 ? 1 : -1
  let err = dx - dy

  while (true) {
    points.push({ x, y })
    if (x === x2 && y === y2) break
    const e2 = err * 2
    if (e2 > -dy) {
      err -= dy
      x += sx
    }
    if (e2 < dx) {
      err += dx
      y += sy
    }
  }

  return points
}

function paintNode(grid: string[][], node: CanvasNode) {
  const left = node.x
  const right = node.x + node.w - 1
  const top = node.y
  const bottom = node.y + node.h - 1
  const label = node.label.trim()

  if (
    node.kind === "line" ||
    node.kind === "arrow" ||
    node.kind === "dashed-line" ||
    node.kind === "dashed-arrow" ||
    node.kind === "double-arrow" ||
    node.kind === "bidirectional-connector"
  ) {
    const { x1, y1, x2, y2 } = connectorEndpoints(node)
    const points = bresenhamPoints(x1, y1, x2, y2)
    const dashed =
      node.kind === "dashed-line" ||
      node.kind === "dashed-arrow" ||
      node.kind === "double-arrow"

    for (let index = 0; index < points.length; index += 1) {
      const point = points[index]
      if (!point) continue
      const isStart = index === 0
      const isEnd = index === points.length - 1
      if (isStart || isEnd) continue
      if (dashed && index % 2 === 1) continue

      const next = points[index + 1] ?? point
      const previous = points[index - 1] ?? point
      const prevChar = segmentChar(previous.x, previous.y, point.x, point.y)
      const nextChar = segmentChar(point.x, point.y, next.x, next.y)
      put(grid, point.x, point.y, prevChar === nextChar ? prevChar : nextChar)
    }

    if (points.length === 1) {
      put(grid, x1, y1, "*")
    } else {
      const endPrev = points[points.length - 2] ?? { x: x1, y: y1 }
      const startNext = points[1] ?? { x: x2, y: y2 }

      if (
        node.kind === "arrow" ||
        node.kind === "dashed-arrow" ||
        node.kind === "double-arrow" ||
        node.kind === "bidirectional-connector"
      ) {
        put(grid, x2, y2, arrowHeadChar(endPrev.x, endPrev.y, x2, y2))
      } else {
        put(grid, x2, y2, segmentChar(endPrev.x, endPrev.y, x2, y2))
      }

      if (
        node.kind === "double-arrow" ||
        node.kind === "bidirectional-connector"
      ) {
        put(grid, x1, y1, arrowHeadChar(startNext.x, startNext.y, x1, y1))
      } else {
        put(grid, x1, y1, segmentChar(x1, y1, startNext.x, startNext.y))
      }
    }

    const labelLeft = Math.min(x1, x2)
    const labelRight = Math.max(x1, x2)
    const labelTop = Math.min(y1, y2)
    const labelBottom = Math.max(y1, y2)
    const labelY =
      labelTop > 0
        ? labelTop - 1
        : labelBottom + 1 < grid.length
          ? labelBottom + 1
          : labelTop
    putCenteredText(grid, labelLeft, labelRight, labelY, label)
    return
  }

  if (node.kind === "junction") {
    const cx = left + Math.floor(node.w / 2)
    const cy = top + Math.floor(node.h / 2)
    for (let x = left; x <= right; x += 1) put(grid, x, cy, "-")
    for (let y = top; y <= bottom; y += 1) put(grid, cx, y, "|")
    put(grid, cx, cy, "*")
    putCenteredText(grid, left, right, cy, label)
    return
  }

  if (node.kind === "decision") {
    const cx = left + Math.floor(node.w / 2)
    put(grid, cx, top, "/")
    put(grid, cx, bottom, "\\")
    for (let y = top + 1; y < bottom; y += 1) {
      const delta = Math.min(y - top, bottom - y)
      put(grid, cx - delta, y, "/")
      put(grid, cx + delta, y, "\\")
    }
    const labelY = top + Math.floor(node.h / 2)
    putCenteredText(grid, left, right, labelY, label)
    return
  }

  if (node.kind === "io") {
    drawBox(grid, left, right, top, bottom)
    if (node.w > 3) {
      put(grid, left, top, "/")
      put(grid, right, bottom, "/")
    }
    if (node.w > 2 && node.h > 2) putCenteredText(grid, left + 1, right - 1, top + 1, label)
    return
  }

  if (node.kind === "document") {
    drawBox(grid, left, right, top, bottom)
    if (node.w > 3 && node.h > 2) {
      put(grid, right - 1, top, "/")
      for (let x = left + 1; x < right; x += 1) {
        put(grid, x, bottom, (x - left) % 2 === 0 ? "~" : "-")
      }
    }
    if (node.w > 2 && node.h > 2) putCenteredText(grid, left + 1, right - 1, top + 1, label)
    return
  }

  if (node.kind === "storage") {
    const midX = left + Math.floor(node.w / 2)
    put(grid, midX, top, "_")
    for (let x = left + 1; x < right; x += 1) put(grid, x, top + 1, "-")
    for (let y = top + 2; y < bottom; y += 1) {
      put(grid, left, y, "|")
      put(grid, right, y, "|")
    }
    for (let x = left + 1; x < right; x += 1) put(grid, x, bottom, "-")
    put(grid, left, top + 1, "(")
    put(grid, right, top + 1, ")")
    put(grid, left, bottom, "(")
    put(grid, right, bottom, ")")
    if (node.w > 2 && node.h > 3) putCenteredText(grid, left + 1, right - 1, top + 2, label)
    return
  }

  if (node.kind === "swimlane-separator") {
    const y = top + Math.floor(node.h / 2)
    for (let x = left; x <= right; x += 1) put(grid, x, y, "=")
    const labelY = top > 0 ? top - 1 : bottom + 1 < grid.length ? bottom + 1 : y
    putCenteredText(grid, left, right, labelY, label)
    return
  }

  if (node.kind === "note") {
    drawBox(grid, left, right, top, bottom)
    if (node.w > 3 && node.h > 2) {
      put(grid, right - 1, top + 1, "/")
    }
    if (node.w > 2 && node.h > 2) putCenteredText(grid, left + 1, right - 1, top + 1, label)
    return
  }

  if (node.kind === "bullet-list") {
    drawBox(grid, left, right, top, bottom)
    const items = (node.label || "item 1;item 2;item 3")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
    const interiorWidth = Math.max(0, node.w - 4)
    let row = top + 1
    for (const item of items) {
      if (row >= bottom) break
      put(grid, left + 1, row, "*")
      putText(grid, left + 3, row, item, interiorWidth)
      row += 1
    }
    return
  }

  if (node.kind === "text") {
    const y = top + Math.floor(node.h / 2)
    putCenteredText(grid, left, right, y, label)
    return
  }

  if (node.h === 1) {
    putText(grid, left, top, `[${node.kind}:${node.label}]`, node.w)
    return
  }

  drawBox(grid, left, right, top, bottom)

  const interiorWidth = Math.max(0, node.w - 2)
  const interiorHeight = Math.max(0, node.h - 2)
  if (interiorWidth === 0 || interiorHeight === 0) return

  const text = `${node.kind.toUpperCase()} ${node.label}`
  const clipped = text.slice(0, interiorWidth)
  const textX = left + 1 + Math.max(0, Math.floor((interiorWidth - clipped.length) / 2))
  const textY = top + 1 + Math.max(0, Math.floor((interiorHeight - 1) / 2))

  putText(grid, textX, textY, clipped, interiorWidth)
}

function serialize(grid: string[][]) {
  const lines = grid.map((row) => row.join("").replace(/\s+$/g, ""))
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop()
  return lines.join("\n")
}

export function renderAscii(nodes: CanvasNode[], options: RenderOptions): string {
  const normalized = normalizeNodes(nodes, options).sort((a, b) => {
    if (a.z !== b.z) return a.z - b.z
    if (a.y !== b.y) return a.y - b.y
    if (a.x !== b.x) return a.x - b.x
    return a.id.localeCompare(b.id)
  })

  const grid = makeGrid(options.width, options.height)
  for (const node of normalized) paintNode(grid, node)
  return serialize(grid)
}

export function renderMarkdown(nodes: CanvasNode[], options: RenderOptions): string {
  const ascii = renderAscii(nodes, options)
  return ["# Asciify Draft", "", "```text", ascii, "```", ""].join("\n")
}
