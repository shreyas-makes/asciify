import { Head, Link, usePage } from "@inertiajs/react"
import { ArrowRight, FileText, Plus, Rocket, Share2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { designClasses } from "@/design-system"
import AppLayout from "@/layouts/app-layout"
import { dashboardPath, rootPath } from "@/routes"
import type { BreadcrumbItem, SharedProps } from "@/types"

const breadcrumbs: BreadcrumbItem[] = [
  {
    title: "Dashboard",
    href: dashboardPath(),
  },
]

export default function Dashboard() {
  const page = usePage<
    SharedProps &
      Record<string, unknown> & {
        drafts: {
          id: number
          title: string
          updated_at: string
          version: number
          node_count: number
          share_url: string | null
        }[]
      }
  >()
  const drafts = page.props.drafts ?? []
  const sharedCount = drafts.filter((draft) => draft.share_url).length

  return (
    <AppLayout breadcrumbs={breadcrumbs}>
      <Head title={breadcrumbs[breadcrumbs.length - 1].title} />

      <div
        className={`${designClasses.page} flex h-full flex-1 flex-col gap-4 overflow-x-auto p-4`}
      >
        <section className={`${designClasses.panel} px-5 py-4`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className={designClasses.kicker}>Workspace</p>
              <h1 className="text-3xl font-bold">ASCII Dashboard</h1>
              <p className={`${designClasses.muted} mt-1 text-sm`}>
                Keep shipping slices from canvas to markdown without design
                drift.
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
                <Button
                  variant="outline"
                  className={`gap-2 ${designClasses.buttonSoft}`}
                >
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
            <p className="mt-2 text-3xl font-bold">{drafts.length}</p>
            <p className={`${designClasses.muted} mt-1 text-sm`}>
              ASCII drawings saved to your account
            </p>
          </div>
          <div className={`${designClasses.panel} p-4`}>
            <p className={designClasses.kicker}>Shares</p>
            <p className="mt-2 text-3xl font-bold">{sharedCount}</p>
            <p className={`${designClasses.muted} mt-1 text-sm`}>
              Drawings with active share links
            </p>
          </div>
          <div className={`${designClasses.panel} p-4`}>
            <p className={designClasses.kicker}>Nodes</p>
            <p className="mt-2 text-3xl font-bold">
              {drafts.reduce((sum, draft) => sum + draft.node_count, 0)}
            </p>
            <p className={`${designClasses.muted} mt-1 text-sm`}>
              Total elements across all drawings
            </p>
          </div>
        </section>

        <section className="grid flex-1 gap-4 lg:grid-cols-[2fr_1fr]">
          <div className={`${designClasses.panel} min-h-[380px] p-4`}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className={designClasses.sectionTitle}>Your Drawings</h2>
            </div>
            {drafts.length === 0 ? (
              <div className={`${designClasses.inset} p-6 text-center`}>
                <p className="text-base font-semibold">No drawings yet</p>
                <p className={`${designClasses.muted} mt-1 text-sm`}>
                  Start a new canvas to create your first ASCII drawing.
                </p>
                <Link href={rootPath()} className="mt-4 inline-block">
                  <Button className={`gap-2 ${designClasses.buttonStrong}`}>
                    <Plus className="size-4" />
                    New Canvas
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {drafts.map((draft) => (
                  <article
                    key={draft.id}
                    className={`${designClasses.inset} bg-[var(--surface-2)] p-3 text-[var(--app-ink)]`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {draft.title}
                        </p>
                        <p className={`${designClasses.muted} mt-1 text-xs`}>
                          Updated {new Date(draft.updated_at).toLocaleString()}{" "}
                          - v{draft.version}
                        </p>
                        <p className={`${designClasses.muted} mt-1 text-xs`}>
                          {draft.node_count} node
                          {draft.node_count === 1 ? "" : "s"}
                        </p>
                      </div>
                      {draft.share_url && (
                        <span className="rounded-full border border-[var(--line)] bg-[var(--surface-1)] px-2 py-0.5 text-[10px] font-semibold tracking-[0.08em] uppercase">
                          Shared
                        </span>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>

          <div className={`${designClasses.panel} p-4`}>
            <h2 className={designClasses.sectionTitle}>Quick Launch</h2>
            <p className={`${designClasses.muted} mt-1 text-sm`}>
              Jump back into your ASCII workflow.
            </p>
            <div className="mt-4 space-y-2">
              <Link href={rootPath()} className="block">
                <Button
                  className={`w-full justify-start gap-2 ${designClasses.buttonStrong}`}
                >
                  <Rocket className="size-4" />
                  Continue Editing
                </Button>
              </Link>
              <Link href={rootPath()} className="block">
                <Button
                  variant="outline"
                  className={`w-full justify-start gap-2 ${designClasses.buttonSoft}`}
                >
                  <Share2 className="size-4" />
                  Manage Share Links
                </Button>
              </Link>
              <Link href={rootPath()} className="block">
                <Button
                  variant="outline"
                  className={`w-full justify-start gap-2 ${designClasses.buttonSoft}`}
                >
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
