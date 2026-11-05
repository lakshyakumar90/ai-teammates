import type { ReactNode } from "react"
import Link from "next/link"
import { DocsSidebar } from "@/components/docs/docs-sidebar"
import { DocsMobileNav } from "@/components/docs/docs-mobile-nav"
import "./docs.css"

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="docs-shell">
      <header className="docs-header">
        <Link href="/" className="docs-header-brand" aria-label="AI Teammates home">
          <span className="docs-header-mark" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          AI Teammates <span className="docs-header-docs">Docs</span>
        </Link>
        <div className="docs-header-actions">
          <span className="docs-header-version">Project notes · v0.0.1</span>
          <Link href="/docs" className="docs-header-link">
            Documentation
          </Link>
          <Link href="/dashboard" className="docs-header-link">
            Dashboard
          </Link>
        </div>
      </header>

      <div className="docs-body">
        <aside className="docs-aside" aria-label="Sidebar">
          <DocsSidebar />
        </aside>
        <div className="docs-main">
          <div className="docs-mobile-bar">
            <DocsMobileNav />
          </div>
          <main id="docs-main" tabIndex={-1}>
            {children}
          </main>
        </div>
      </div>

      <footer className="docs-footer">
        <span>© {new Date().getFullYear()} AI Teammates — Project Notes</span>
        <span>Built from the repository itself · No secret values shown</span>
      </footer>
    </div>
  )
}
