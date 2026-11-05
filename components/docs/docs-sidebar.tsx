"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { DOCS_SECTIONS } from "@/lib/docs/navigation"
import { cn } from "@/lib/utils"

export function DocsSidebar({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname()
  const currentSlug = pathname.replace("/docs", "").replace(/^\//, "") || "readme"

  return (
    <nav className={cn("docs-sidebar", mobile && "docs-sidebar-mobile")} aria-label="Documentation">
      <div className="docs-sidebar-heading">Documentation</div>
      {DOCS_SECTIONS.map((section) => (
        <div key={section.title} className="docs-sidebar-section">
          <div className="docs-sidebar-section-title">{section.title}</div>
          <ul className="docs-sidebar-list">
            {section.items.map((item) => {
              const active = item.slug === currentSlug
              const href = item.slug === "readme" ? "/docs" : `/docs/${item.slug}`
              return (
                <li key={item.slug}>
                  <Link
                    href={href}
                    className={cn("docs-sidebar-link", active && "docs-sidebar-link-active")}
                    aria-current={active ? "page" : undefined}
                  >
                    <span className="docs-sidebar-link-text">{item.shortTitle}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
      <div className="docs-sidebar-footer">
        <Link href="/" className="docs-sidebar-footer-link">
          ← Back to app
        </Link>
        <span className="docs-sidebar-count">
          {DOCS_SECTIONS.reduce((n, s) => n + s.items.length, 0)} pages · 15 diagrams
        </span>
      </div>
    </nav>
  )
}
