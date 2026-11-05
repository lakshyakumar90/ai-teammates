"use client"

import { useEffect, useRef, useState } from "react"

type Props = {
  source: string
  id: string
  title?: string
}

function detectTheme(): "dark" | "default" {
  if (typeof document === "undefined") return "default"
  const root = document.documentElement
  if (root.classList.contains("dark")) return "dark"
  // next-themes sets colorScheme; also check localStorage theme preference
  try {
    const stored = window.localStorage.getItem("theme")
    if (stored === "dark") return "dark"
    if (stored === "light") return "default"
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark"
  } catch {
    // ignore
  }
  return "default"
}

/**
 * Renders a Mermaid diagram client-side (mermaid needs DOM APIs).
 * Theme-aware: re-renders when the app's .dark class flips (next-themes),
 * with explicit light/dark mermaid themeVariables matching the docs palette —
 * no more white background + dark text in dark mode.
 */
export function MermaidDiagram({ source, id, title }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const [rendered, setRendered] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [theme, setTheme] = useState<"dark" | "default">(() => detectTheme())

  // Watch the <html> element for next-themes class changes.
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setTheme(detectTheme())
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let cancelled = false
    async function render() {
      setError(null)
      setRendered(false)
      try {
        const mermaid = (await import("mermaid")).default
        const isDark = theme === "dark"
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "loose",
          theme: "base",
          themeVariables: isDark
            ? {
                primaryBackground: "#26292e",
                primaryTextColor: "#e7e7e7",
                primaryBorderColor: "#3a3f46",
                lineColor: "#9aa0a8",
                secondaryBackground: "#1e2126",
                secondaryTextColor: "#d7d7d7",
                tertiaryBackground: "#2b2f36",
                background: "#1a1c20",
                mainBkg: "#26292e",
                nodeBorder: "#3a3f46",
                clusterBkg: "#1e2126",
                clusterBorder: "#3a3f46",
                edgeLabelBackground: "#1a1c20",
                noteBackground: "#3a3f46",
                noteTextColor: "#e7e7e7",
                fontFamily: "inherit",
              }
            : {
                primaryBackground: "#ffffff",
                primaryTextColor: "#171717",
                primaryBorderColor: "#d4d4d4",
                lineColor: "#737373",
                secondaryBackground: "#f5f5f5",
                secondaryTextColor: "#262626",
                tertiaryBackground: "#fafafa",
                background: "#ffffff",
                mainBkg: "#ffffff",
                nodeBorder: "#a3a3a3",
                clusterBkg: "#f5f5f5",
                clusterBorder: "#d4d4d4",
                edgeLabelBackground: "#ffffff",
                noteBackground: "#fefce8",
                noteTextColor: "#171717",
                fontFamily: "inherit",
              },
          flowchart: { htmlLabels: true, curve: "basis" },
          sequence: { useMaxWidth: true },
        })
        const safeId = `mermaid-${id}-${theme}-${Math.random().toString(36).slice(2, 8)}`
        const { svg } = await mermaid.render(safeId, source)
        if (cancelled || !mountRef.current) return
        mountRef.current.innerHTML = svg
        setRendered(true)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Diagram failed to render")
        }
      }
    }
    render()
    return () => {
      cancelled = true
    }
  }, [source, id, theme])

  if (error) {
    return (
      <figure className="docs-diagram docs-diagram-error">
        {title && <figcaption className="docs-diagram-title">{title}</figcaption>}
        <div className="docs-diagram-error-title">Diagram could not be rendered</div>
        <pre className="docs-diagram-source">{source}</pre>
        <div className="docs-diagram-error-msg">{error}</div>
      </figure>
    )
  }

  return (
    <figure className="docs-diagram" role="img" aria-label={title ?? `Diagram: ${id}`}>
      {title && <figcaption className="docs-diagram-title">{title}</figcaption>}
      {!rendered && <pre className="docs-diagram-source">{source}</pre>}
      <div ref={mountRef} className="docs-diagram-rendered" hidden={!rendered} />
    </figure>
  )
}
