import Link from "next/link"
import { DIAGRAMS } from "@/lib/docs/diagrams"

const GROUPS: { key: string; title: string }[] = [
  { key: "core", title: "Core Architecture" },
  { key: "flows", title: "Workflows & Data Flows" },
  { key: "data", title: "Data Model" },
  { key: "features", title: "Feature Workflows" },
]

export function DiagramGallery() {
  return (
    <div className="docs-gallery">
      {GROUPS.map((group) => {
        const items = DIAGRAMS.filter((d) => d.group === group.key)
        if (items.length === 0) return null
        return (
          <section key={group.key} className="docs-gallery-group">
            <h2 className="docs-gallery-group-title">{group.title}</h2>
            <div className="docs-gallery-grid">
              {items.map((d) => (
                <Link
                  key={d.id}
                  href={`/docs/diagrams/${encodeURIComponent(d.id)}`}
                  className="docs-gallery-card"
                >
                  <div className="docs-gallery-card-category">{d.category}</div>
                  <div className="docs-gallery-card-title">{d.title}</div>
                  <p className="docs-gallery-card-desc">{d.description}</p>
                  <div className="docs-gallery-card-source">
                    <code>{d.sourcePath}</code>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
