import Link from "next/link"
import { getNextPrev } from "@/lib/docs/navigation"
import { ArrowLeft, ArrowRight } from "lucide-react"

export function DocsNextPrev({ slug }: { slug: string }) {
  const { prev, next } = getNextPrev(slug)

  return (
    <nav className="docs-next-prev" aria-label="Pagination">
      {prev ? (
        <Link
          href={prev.slug === "readme" ? "/docs" : `/docs/${prev.slug}`}
          className="docs-next-prev-link docs-next-prev-prev"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          <span>
            <span className="docs-next-prev-label">Previous</span>
            <span className="docs-next-prev-title">{prev.shortTitle}</span>
          </span>
        </Link>
      ) : (
        <span />
      )}
      {next && (
        <Link
          href={next.slug === "readme" ? "/docs" : `/docs/${next.slug}`}
          className="docs-next-prev-link docs-next-prev-next"
        >
          <span>
            <span className="docs-next-prev-label">Next</span>
            <span className="docs-next-prev-title">{next.shortTitle}</span>
          </span>
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      )}
    </nav>
  )
}
