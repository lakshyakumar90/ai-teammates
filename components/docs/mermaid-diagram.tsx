"use client"

import { useEffect, useRef, useState } from "react"

type Props = {
  source: string
  id: string
}

/**
 * Renders a Mermaid diagram client-side (mermaid needs DOM APIs).
 * The SSR render is a <pre> fallback so the page is still meaningful in HTML.
 */
export function MermaidDiagram({ source, id }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [rendered, setRendered] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function render() {
      try {
        const mermaid = (await import("mermaid")).default
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "loose",
          theme: "neutral",
          flowchart: { htmlLabels: true },
        })
        const safeId = `mermaid-${id}-${Math.random().toString(36).slice(2, 8)}`
        const { svg } = await mermaid.render(safeId, source)
        if (cancelled || !ref.current) return
        ref.current.innerHTML = svg
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
  }, [source, id])

  if (error) {
    return (
      <div className="docs-diagram docs-diagram-error">
        <div className="docs-diagram-error-title">Diagram could not be rendered</div>
        <pre>{source}</pre>
        <div className="docs-diagram-error-msg">{error}</div>
      </div>
    )
  }

  return (
    <div className="docs-diagram" role="img" aria-label={`Diagram: ${id}`}>
      {!rendered && (
        <pre className="docs-diagram-source">{source}</pre>
      )}
      <div ref={ref} className="docs-diagram-rendered" hidden={!rendered} />
    </div>
  )
}
