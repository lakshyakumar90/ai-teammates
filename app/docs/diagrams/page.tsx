import type { Metadata } from "next"
import { DiagramGallery } from "@/components/docs/diagram-gallery"
import { DIAGRAMS } from "@/lib/docs/diagrams"

export const metadata: Metadata = {
  title: "Diagram Gallery — AI Teammates Docs",
  description:
    "All 15 Mermaid architecture, workflow, and data-model diagrams for the AI Teammates repository, each on its own page.",
}

export const dynamic = "force-static"

export default function DiagramsIndexPage() {
  return (
    <article className="docs-article">
      <div className="docs-article-breadcrumb" aria-label="Breadcrumb">
        <span>Documentation</span>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Diagram Gallery</span>
      </div>

      <div className="docs-prose">
        <h1>Diagram Gallery</h1>
        <p>
          All {DIAGRAMS.length} architecture, workflow, and data-model diagrams from the
          repository, each rendered on its own page. Diagrams are theme-aware — they
          follow the app&rsquo;s light/dark mode automatically. Source files live in{" "}
          <code>docs/project-notes/diagrams/</code> and are the single source of truth;
          the same diagrams are also inlined where they are discussed in the guides.
        </p>
      </div>

      <DiagramGallery />

      <p className="docs-gallery-note">
        Diagrams: {DIAGRAMS.length} · Categories: Architecture (4), Workflows &amp; Data
        Flows (4), Data Model (1), Feature Workflows (6). Each diagram page shows the
        rendered SVG, its source path, and links to the guide that explains it.
      </p>
    </article>
  )
}
