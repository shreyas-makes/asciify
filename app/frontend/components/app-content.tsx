import type * as React from "react"

import { SidebarInset } from "@/components/ui/sidebar"
import { designClasses } from "@/design-system"

type AppContentProps = {
  variant?: "header" | "sidebar"
} & React.ComponentProps<"main">

export function AppContent({
  variant = "header",
  children,
  ...props
}: AppContentProps) {
  if (variant === "sidebar") {
    return (
      <SidebarInset className="bg-[var(--app-bg)]" {...props}>
        {children}
      </SidebarInset>
    )
  }

  return (
    <main
      className={`mx-auto flex h-full w-full max-w-7xl flex-1 flex-col gap-4 rounded-xl ${designClasses.page}`}
      {...props}
    >
      {children}
    </main>
  )
}
