"use client"

import { useState } from "react"
import Link from "next/link"
import { Menu } from "lucide-react"
import { DocsSidebar } from "./docs-sidebar"
import { cn } from "@/lib/utils"

export function DocsMobileNav() {
  const [open, setOpen] = useState(false)

  return (
    <div className="docs-mobile-nav">
      <button
        type="button"
        className="docs-mobile-nav-trigger"
        aria-expanded={open}
        aria-controls="docs-mobile-panel"
        onClick={() => setOpen((v) => !v)}
      >
        <Menu size={18} aria-hidden="true" />
        Documentation
      </button>
      <div
        id="docs-mobile-panel"
        className={cn("docs-mobile-panel", open && "docs-mobile-panel-open")}
        onClick={() => setOpen(false)}
      >
        {open && (
          <div className="docs-mobile-panel-inner">
            <DocsSidebar mobile />
          </div>
        )}
      </div>
      <Link href="/" className="docs-mobile-nav-home">
        ← Home
      </Link>
    </div>
  )
}
