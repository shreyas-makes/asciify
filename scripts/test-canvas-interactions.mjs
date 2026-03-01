import assert from "node:assert/strict"
import { execSync } from "node:child_process"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"

const ROOT = process.cwd()
const OUT_DIR = path.join(ROOT, "tmp", "canvas-tests")

function run(cmd) {
  execSync(cmd, { stdio: "inherit", cwd: ROOT })
}

rmSync(OUT_DIR, { recursive: true, force: true })
mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(path.join(OUT_DIR, "package.json"), '{"type":"commonjs"}\n')

run(
  "npx tsc app/frontend/lib/ascii/types.ts app/frontend/lib/canvas/interactions.ts " +
    "--outDir tmp/canvas-tests --target ES2020 --module commonjs --moduleResolution node --skipLibCheck",
)

const require = createRequire(import.meta.url)
const {
  getNodeTextScale,
  shouldCommitInlineEditKey,
  createPlacementEditState,
  createNodeFromTwoPoints,
  isConnectorKind,
} = require(path.join(OUT_DIR, "canvas", "interactions.js"))

const smallNode = {
  id: "node-1",
  kind: "button",
  label: "Button",
  x: 2,
  y: 2,
  w: 8,
  h: 2,
  z: 1,
}
const largeNode = { ...smallNode, id: "node-2", w: 26, h: 9 }

const smallScale = getNodeTextScale(smallNode, 8, 16)
const largeScale = getNodeTextScale(largeNode, 8, 16)
assert.equal(smallScale.fontSize >= 10, true, "small nodes should keep readable minimum font")
assert.equal(largeScale.fontSize > smallScale.fontSize, true, "larger nodes should scale text up")

assert.equal(shouldCommitInlineEditKey("Enter"), true, "Enter should commit inline edits")
assert.equal(shouldCommitInlineEditKey("Escape"), true, "Escape should also commit inline edits")
assert.equal(shouldCommitInlineEditKey("Tab"), false, "other keys should not commit inline edits")

const placement = createPlacementEditState({
  id: "node-99",
  kind: "card",
  label: "Card",
  x: 10,
  y: 5,
  w: 24,
  h: 8,
  z: 4,
})
assert.deepEqual(placement, {
  selectedId: "node-99",
  selectedIds: ["node-99"],
  editingId: "node-99",
  editingLabel: "Card",
})

assert.equal(isConnectorKind("line"), true, "line should be treated as connector")
assert.equal(isConnectorKind("card"), false, "card should not be treated as connector")

const twoPointCard = createNodeFromTwoPoints({
  kind: "card",
  nodes: [smallNode],
  canvasWidth: 120,
  canvasHeight: 80,
  startX: 22,
  startY: 15,
  endX: 31,
  endY: 21,
})
assert.equal(twoPointCard.x, 22, "two-point shapes should start at min x")
assert.equal(twoPointCard.y, 15, "two-point shapes should start at min y")
assert.equal(twoPointCard.w, 10, "two-point shapes should use pointer span width")
assert.equal(twoPointCard.h, 7, "two-point shapes should use pointer span height")

const angledArrow = createNodeFromTwoPoints({
  kind: "arrow",
  nodes: [smallNode],
  canvasWidth: 120,
  canvasHeight: 80,
  startX: 10,
  startY: 10,
  endX: 16,
  endY: 14,
})
assert.equal(angledArrow.startX, 10, "connector should preserve start point")
assert.equal(angledArrow.startY, 10, "connector should preserve start point")
assert.equal(angledArrow.endX, 16, "connector should preserve end point")
assert.equal(angledArrow.endY, 14, "connector should preserve end point")
assert.equal(angledArrow.w, 7, "connector bbox width should follow endpoints")
assert.equal(angledArrow.h, 5, "connector bbox height should follow endpoints")

console.log("Canvas interaction tests passed")
