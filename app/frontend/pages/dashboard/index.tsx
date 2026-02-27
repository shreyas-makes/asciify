import { Head, Link } from "@inertiajs/react"
import { ArrowRight, Clock3, FileText, Plus, Rocket, Share2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { designClasses } from "@/design-system"
import AppLayout from "@/layouts/app-layout"
import { dashboardPath, rootPath } from "@/routes"
import type { BreadcrumbItem } from "@/types"

const breadcrumbs: BreadcrumbItem[] = [
  {
    title: "Dashboard",
    href: dashboardPath(),
  },
]

export default function Dashboard() {
  return (
    <AppLayout breadcrumbs={breadcrumbs}>
      <Head title={breadcrumbs[breadcrumbs.length - 1].title} />

      <div className={`${designClasses.page} flex h-full flex-1 flex-col gap-4 overflow-x-auto p-4`}>
        <section className={`${designClasses.panel} px-5 py-4`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className={designClasses.kicker}>Workspace</p>
              <h1 className="text-3xl font-bold">ASCII Dashboard</h1>
              <p className={`${designClasses.muted} mt-1 text-sm`}>
                Keep shipping slices from canvas to markdown without design drift.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={rootPath()}>
                <Button className={`gap-2 ${designClasses.buttonStrong}`}>
                  <Plus className="size-4" />
                  New Canvas
                </Button>
              </Link>
              <Link href={rootPath()}>
                <Button variant="outline" className={`gap-2 ${designClasses.buttonSoft}`}>
                  Open Studio
                  <ArrowRight className="size-4" />
                </Button>
              </Link>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div className={`${designClasses.panel} p-4`}>
            <p className={designClasses.kicker}>Drafts</p>
            <p className="mt-2 text-3xl font-bold">12</p>
            <p className={`${designClasses.muted} mt-1 text-sm`}>Canvas documents in progress</p>
          </div>
          <div className={`${designClasses.panel} p-4`}>
            <p className={designClasses.kicker}>Shares</p>
            <p className="mt-2 text-3xl font-bold">4</p>
            <p className={`${designClasses.muted} mt-1 text-sm`}>Active shared links</p>
          </div>
          <div className={`${designClasses.panel} p-4`}>
            <p className={designClasses.kicker}>Export Rate</p>
            <p className="mt-2 text-3xl font-bold">92%</p>
            <p className={`${designClasses.muted} mt-1 text-sm`}>Markdown exports with no edits</p>
          </div>
        </section>

        <section className="grid flex-1 gap-4 lg:grid-cols-[2fr_1fr]">
          <div className={`${designClasses.panelStrong} min-h-[380px] p-4`}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className={designClasses.sectionTitle}>Recent Activity</h2>
              <Button variant="outline" className={designClasses.buttonDark}>
                View all
              </Button>
            </div>
            <div className="space-y-3">
              <article className={`${designClasses.inset} bg-[var(--surface-2)] p-3 text-[var(--app-ink)]`}>
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <FileText className="size-4" />
                  Flow Spec v3
                </p>
                <p className={`${designClasses.muted} mt-1 text-xs`}>
                  Updated 24 minutes ago - 3 collaborators
                </p>
              </article>
              <article className={`${designClasses.inset} bg-[var(--surface-2)] p-3 text-[var(--app-ink)]`}>
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Share2 className="size-4" />
                  Slice Delivery Board
                </p>
                <p className={`${designClasses.muted} mt-1 text-xs`}>
                  Shared as edit link - last sync successful
                </p>
              </article>
              <article className={`${designClasses.inset} bg-[var(--surface-2)] p-3 text-[var(--app-ink)]`}>
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Clock3 className="size-4" />
                  Onboarding Journey
                </p>
                <p className={`${designClasses.muted} mt-1 text-xs`}>
                  Autosave restored this morning
                </p>
              </article>
            </div>
          </div>

          <div className={`${designClasses.panel} p-4`}>
            <h2 className={designClasses.sectionTitle}>Quick Launch</h2>
            <p className={`${designClasses.muted} mt-1 text-sm`}>
              Jump back into your ASCII workflow.
            </p>
            <div className="mt-4 space-y-2">
              <Link href={rootPath()} className="block">
                <Button className={`w-full justify-start gap-2 ${designClasses.buttonStrong}`}>
                  <Rocket className="size-4" />
                  Continue Editing
                </Button>
              </Link>
              <Link href={rootPath()} className="block">
                <Button variant="outline" className={`w-full justify-start gap-2 ${designClasses.buttonSoft}`}>
                  <Share2 className="size-4" />
                  Manage Share Links
                </Button>
              </Link>
              <Link href={rootPath()} className="block">
                <Button variant="outline" className={`w-full justify-start gap-2 ${designClasses.buttonSoft}`}>
                  <FileText className="size-4" />
                  Export Markdown
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </div>
    </AppLayout>
  )
}
