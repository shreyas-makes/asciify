import assert from "node:assert/strict"
import { execSync } from "node:child_process"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"

const ROOT = process.cwd()
const OUT_DIR = path.join(ROOT, "tmp", "ascii-tests")

function run(cmd) {
  execSync(cmd, { stdio: "inherit", cwd: ROOT })
}

function sampleNodes() {
  return [
    {
      id: "node-2",
      kind: "card",
      label: "Hero",
      x: 2,
      y: 2,
      w: 18,
      h: 8,
      z: 2,
    },
    {
      id: "node-1",
      kind: "nav",
      label: "Menu",
      x: 1,
      y: 0,
      w: 20,
      h: 3,
      z: 1,
    },
  ]
}

rmSync(OUT_DIR, { recursive: true, force: true })
mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(path.join(OUT_DIR, "package.json"), '{"type":"commonjs"}\n')

run(
  "npx tsc app/frontend/lib/ascii/types.ts app/frontend/lib/ascii/normalize.ts app/frontend/lib/ascii/render.ts " +
    "--outDir tmp/ascii-tests --target ES2020 --module commonjs --moduleResolution node --skipLibCheck",
)

const require = createRequire(import.meta.url)
const { renderAscii, renderMarkdown } = require(path.join(OUT_DIR, "render.js"))
const { normalizeNodes } = require(path.join(OUT_DIR, "normalize.js"))
const options = { width: 40, height: 20 }

const base = sampleNodes()
assert.equal(
  renderAscii(base, options),
  renderAscii(base, options),
  "same input should produce identical output",
)
assert.equal(
  renderAscii(base, options),
  renderAscii([...base].reverse(), options),
  "insertion order should not change output",
)

const tieA = {
  id: "node-a",
  kind: "button",
  label: "FIRST",
  x: 5,
  y: 5,
  w: 10,
  h: 3,
  z: 2,
}
const tieB = { ...tieA, id: "node-b", label: "SECOND" }
assert.equal(
  renderAscii([tieB, tieA], options),
  renderAscii([tieA, tieB], options),
  "id tie-break should be deterministic for same z/y/x",
)

const layered = renderAscii(
  [
    {
      id: "node-low",
      kind: "card",
      label: "LOW",
      x: 4,
      y: 4,
      w: 20,
      h: 7,
      z: 1,
    },
    {
      id: "node-up",
      kind: "modal",
      label: "UPPER",
      x: 8,
      y: 6,
      w: 18,
      h: 8,
      z: 3,
    },
  ],
  options,
)
assert.match(layered, /MODAL UPPER/, "higher z should appear in overlap")

const clamped = renderAscii(
  [
    {
      id: "node-edge",
      kind: "input",
      label: "Edge",
      x: -9,
      y: -2,
      w: 1,
      h: 1,
      z: 1,
    },
  ],
  options,
)
assert.match(clamped, /INPUT Edge/, "normalization should clamp and keep node visible")
assert.equal(
  clamped.split("\n").every((line) => line.length <= options.width),
  true,
  "renderer should not exceed width bounds",
)

const markdown = renderMarkdown(base, options)
assert.match(markdown, /^# Asciify Draft/m, "markdown output should include fixed title")
assert.match(markdown, /```text[\s\S]*```/m, "markdown output should include text fence")

const normalizedOptionalLabel = normalizeNodes(
  [
    { id: "line-1", kind: "line", label: "", x: 1, y: 1, w: 12, h: 1, z: 1 },
    { id: "arrow-1", kind: "arrow", label: "", x: 1, y: 3, w: 12, h: 1, z: 1 },
    { id: "button-1", kind: "button", label: "", x: 1, y: 5, w: 12, h: 3, z: 1 },
  ],
  options,
)
assert.equal(normalizedOptionalLabel[0].label, "", "line label should remain empty when not specified")
assert.equal(normalizedOptionalLabel[1].label, "", "arrow label should remain empty when not specified")
assert.equal(normalizedOptionalLabel[2].label, "BUTTON", "non-line primitives should keep fallback label")

const solidDoubleArrow = renderAscii(
  [{ id: "bidir", kind: "bidirectional-connector", label: "", x: 1, y: 1, w: 9, h: 1, z: 1 }],
  options,
)
const dashedDoubleArrow = renderAscii(
  [{ id: "double", kind: "double-arrow", label: "", x: 1, y: 1, w: 9, h: 1, z: 1 }],
  options,
)
assert.match(solidDoubleArrow, /<------->/, "bidirectional connector should render as solid double arrow")
assert.match(dashedDoubleArrow, /<[- ]+>/, "double-arrow should render as dashed double arrow")
assert.notEqual(solidDoubleArrow, dashedDoubleArrow, "solid and dashed double-arrow variants should differ")

const diagonalConnector = renderAscii(
  [
    {
      id: "diag-line",
      kind: "line",
      label: "",
      x: 5,
      y: 5,
      w: 7,
      h: 7,
      z: 1,
      startX: 5,
      startY: 5,
      endX: 11,
      endY: 11,
    },
  ],
  options,
)
assert.match(diagonalConnector, /\\/, "endpoint-defined connectors should render diagonals")

const verticalArrowFromEndpoints = renderAscii(
  [
    {
      id: "vertical-arrow",
      kind: "arrow",
      label: "",
      x: 8,
      y: 2,
      w: 1,
      h: 7,
      z: 1,
      startX: 8,
      startY: 2,
      endX: 8,
      endY: 8,
    },
  ],
  options,
)
assert.match(verticalArrowFromEndpoints, /v/, "endpoint arrows should place directionally correct arrowheads")

const primitiveKinds = [
  "button",
  "input",
  "card",
  "modal",
  "nav",
  "text",
  "line",
  "arrow",
  "dashed-line",
  "dashed-arrow",
  "double-arrow",
  "bidirectional-connector",
  "junction",
  "decision",
  "io",
  "document",
  "storage",
  "swimlane-separator",
  "note",
  "bullet-list",
]

for (let index = 0; index < primitiveKinds.length; index += 1) {
  const labelCoverage = renderAscii(
    [
      {
        id: `primitive-${index}`,
        kind: primitiveKinds[index],
        label: `LBL_${index}`,
        x: 2,
        y: 2,
        w: 24,
        h: 8,
        z: 1,
      },
    ],
    { width: 64, height: 24 },
  )

  assert.match(
    labelCoverage,
    new RegExp(`LBL_${index}`),
    `label should be visible for ${primitiveKinds[index]}`,
  )
}

console.log("ASCII renderer tests passed")
