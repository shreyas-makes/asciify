export const brandColors = {
  black: "#000000",
  porcelain: "#fffffc",
  khakiBeige: "#beb7a4",
  vividTangerine: "#ff7f11",
  red: "#ff1b1c",
} as const

export const semanticColorRoles = {
  pageBackground: "var(--app-bg)",
  pageForeground: "var(--app-ink)",
  panelBackground: "var(--surface-1)",
  panelStrongBackground: "var(--surface-strong)",
  borderDefault: "var(--line)",
  borderStrong: "var(--line-strong)",
  actionPrimary: "var(--accent)",
  actionDestructive: "var(--danger)",
} as const

export const designClasses = {
  page: "ds-page",
  shell: "ds-shell",
  panel: "ds-panel",
  panelStrong: "ds-panel-strong",
  kicker: "ds-kicker",
  sectionTitle: "ds-section-title",
  muted: "ds-muted",
  inset: "ds-inset",
  buttonSoft: "ds-btn-soft",
  buttonStrong: "ds-btn-strong",
  buttonDark: "ds-btn-dark",
  canvasWrap: "ds-canvas-wrap",
  canvasBoard: "ds-canvas-board",
  workspace: "ds-workspace",
  floatingTopbar: "ds-floating-topbar",
  sharePanel: "ds-share-panel",
  canvasStage: "ds-canvas-stage",
  toolbarDock: "ds-toolbar-dock",
  toolbarGroup: "ds-toolbar-group",
  toolButton: "ds-tool-btn",
  toolButtonStrong: "ds-tool-btn-strong",
  toolButtonActive: "ds-tool-btn-active",
  toolbarPopover: "ds-popover-panel",
} as const
