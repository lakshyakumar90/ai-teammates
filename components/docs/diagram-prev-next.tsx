import Link from "next/link"
import { getSiblingDiagrams } from "@/lib/docs/diagrams"
import { ArrowLeft, ArrowRight } from "lucide-react"

export function DiagramPrevNext({ id }: { id: string }) {
  const { prev, next } = getSiblingDiagrams(id)
  return (
    <nav className="docs-next-prev" aria-label="Diagram pagination">
      {prev ? (
        <Link
          href={`/docs/diagrams/${encodeURIComponent(prev.id)}`}
          className="docs-next-prev-link docs-next-prev-prev"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          <span>
            <span className="docs-next-prev-label">Previous diagram</span>
            <span className="docs-next-prev-title">{prev.shortTitle}</span>
          </span>
        </Link>
      ) : (
        <span />
      )}
      {next && (
        <Link
          href={`/docs/diagrams/${encodeURIComponent(next.id)}`}
          className="docs-next-prev-link docs-next-prev-next"
        >
          <span>
            <span className="docs-next-prev-label">Next diagram</span>
            <span className="docs-next-prev-title">{next.shortTitle}</span>
          </span>
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      )}
    </nav>
  )
}
