import { useCallback, useEffect, useState } from "react"

export type Appearance = "light" | "dark"

const DEFAULT_APPEARANCE: Appearance = "dark"

const parseAppearance = (value: string | null): Appearance => {
  if (value === "light" || value === "dark") {
    return value
  }

  return DEFAULT_APPEARANCE
}

const applyTheme = (appearance: Appearance) => {
  const isDark = appearance === "dark"

  document.documentElement.classList.toggle("dark", isDark)
  document.documentElement.style.colorScheme = isDark ? "dark" : "light"
}

export function initializeTheme() {
  const savedAppearance = parseAppearance(localStorage.getItem("appearance"))

  applyTheme(savedAppearance)
  localStorage.setItem("appearance", savedAppearance)
}

export function useAppearance() {
  const [appearance, setAppearance] = useState<Appearance>(() => {
    if (typeof window === "undefined") return DEFAULT_APPEARANCE
    return parseAppearance(localStorage.getItem("appearance"))
  })

  const updateAppearance = useCallback((mode: Appearance) => {
    setAppearance(mode)
    localStorage.setItem("appearance", mode)
    applyTheme(mode)
  }, [])

  useEffect(() => {
    applyTheme(appearance)
  }, [appearance])

  return { appearance, updateAppearance } as const
}
