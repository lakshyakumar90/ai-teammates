import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import { readDiagram } from "@/lib/docs/source"
import { DIAGRAM_IDS, getDiagram } from "@/lib/docs/diagrams"
import { MermaidDiagram } from "@/components/docs/mermaid-diagram"
import { DiagramPrevNext } from "@/components/docs/diagram-prev-next"

export function generateStaticParams() {
  return DIAGRAM_IDS.map((id) => ({ id }))
}

export const dynamic = "force-static"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const entry = getDiagram(id)
  return {
    title: entry ? `${entry.title} — AI Teammates Docs` : "Diagram — AI Teammates Docs",
    description: entry
      ? `${entry.title}: ${entry.description}`
      : `AI Teammates diagram ${id}`,
  }
}

export default async function DiagramPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const entry = getDiagram(id)
  if (!entry) notFound()

  const source = readDiagram(id)
  if (!source) notFound()

  return (
    <article className="docs-article">
      <div className="docs-article-breadcrumb" aria-label="Breadcrumb">
        <span>Documentation</span>
        <span aria-hidden="true">/</span>
        <Link href="/docs/diagrams">Diagram Gallery</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{entry.shortTitle}</span>
      </div>

      <div className="docs-prose">
        <h1>{entry.title}</h1>
        <p>{entry.description}</p>
        <p>
          <strong>Category:</strong> {entry.category}
          {" · "}
          <strong>Source:</strong> <code>{entry.sourcePath}</code>
          {entry.relatedDoc && (
            <>
              {" · "}
              <strong>Explained in:</strong>{" "}
              <Link href={`/docs/${entry.relatedDoc}`}>
                {entry.relatedDoc}
              </Link>
            </>
          )}
        </p>
      </div>

      <MermaidDiagram source={source} id={id} title={entry.title} />

      <details className="docs-diagram-source-toggle">
        <summary>View Mermaid source</summary>
        <pre className="docs-diagram-source">{source}</pre>
      </details>

      <DiagramPrevNext id={id} />
    </article>
  )
}
