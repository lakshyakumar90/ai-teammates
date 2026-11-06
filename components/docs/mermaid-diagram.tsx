"use client"

import { useEffect, useRef, useState } from "react"

type Props = {
  source: string
  id: string
  title?: string
}

function detectTheme(): "dark" | "default" {
  if (typeof document === "undefined") return "default"
  if (document.documentElement.classList.contains("dark")) return "dark"
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
 * Complete theme variable sets per diagram family.
 * The previous version only set flowchart variables — sequence diagrams
 * (participants/actors), ER diagrams (entity boxes), and state diagrams
 * fell back to mermaid's white defaults, producing white-on-white text.
 * Every family-specific variable is now set explicitly per mode.
 */
function themeVariables(mode: "dark" | "default"): Record<string, string> {
  if (mode === "dark") {
    return {
      // Base / flowchart
      primaryBackground: "#26292e",
      primaryTextColor: "#e7e7e7",
      primaryBorderColor: "#4b525c",
      lineColor: "#9aa0a8",
      secondaryBackground: "#1e2126",
      secondaryTextColor: "#d7d7d7",
      tertiaryBackground: "#2b2f36",
      background: "#1a1c20",
      mainBkg: "#26292e",
      nodeBorder: "#4b525c",
      clusterBkg: "#1e2126",
      clusterBorder: "#4b525c",
      edgeLabelBackground: "#1a1c20",
      // Sequence diagrams
      signalColor: "#c9ced6",
      signalTextColor: "#e7e7e7",
      labelBoxBkgColor: "#26292e",
      labelBoxBorderColor: "#4b525c",
      labelTextColor: "#e7e7e7",
      actorBkg: "#26292e",
      actorBorder: "#4b525c",
      actorTextColor: "#e7e7e7",
      actorLineColor: "#9aa0a8",
      noteBkgColor: "#2b2f36",
      noteTextColor: "#e7e7e7",
      noteBorderColor: "#4b525c",
      // ER diagrams
      primaryColor: "#26292e",
      entityBkg: "#26292e",
      entityBorder: "#4b525c",
      headerBkg: "#2b2f36",
      headerBorder: "#4b525c",
      // State diagrams
      stateBkg: "#26292e",
      stateBorder: "#4b525c",
      stateLabelColor: "#e7e7e7",
      stateLabelFontColor: "#e7e7e7",
      compositeBackground: "#1e2126",
      compositeTitleBackground: "#26292e",
      compositeBorder: "#4b525c",
      // Gantt / other families (safe defaults)
      taskTextDark: "#e7e7e7",
      taskTextLight: "#171717",
      gridColor: "#3a3f46",
      sectionBkg: "#1e2126",
      altSectionBkg: "#26292e",
      todayLineColor: "#e7e7e7",
      // Generic text
      textColor: "#e7e7e7",
      fontFamily: "inherit",
      fontSize: "14px",
    }
  }
  return {
    // Base / flowchart
    primaryBackground: "#ffffff",
    primaryTextColor: "#171717",
    primaryBorderColor: "#a3a3a3",
    lineColor: "#737373",
    secondaryBackground: "#f5f5f5",
    secondaryTextColor: "#262626",
    tertiaryBackground: "#fafafa",
    background: "#ffffff",
    mainBkg: "#ffffff",
    nodeBorder: "#737373",
    clusterBkg: "#f5f5f5",
    clusterBorder: "#d4d4d4",
    edgeLabelBackground: "#ffffff",
    // Sequence diagrams
    signalColor: "#404040",
    signalTextColor: "#171717",
    labelBoxBkgColor: "#f5f5f5",
    labelBoxBorderColor: "#a3a3a3",
    labelTextColor: "#171717",
    actorBkg: "#ffffff",
    actorBorder: "#737373",
    actorTextColor: "#171717",
    actorLineColor: "#737373",
    noteBkgColor: "#fefce8",
    noteTextColor: "#171717",
    noteBorderColor: "#a3a3a3",
    // ER diagrams
    primaryColor: "#ffffff",
    entityBkg: "#ffffff",
    entityBorder: "#a3a3a3",
    headerBkg: "#f5f5f5",
    headerBorder: "#a3a3a3",
    // State diagrams
    stateBkg: "#ffffff",
    stateBorder: "#737373",
    stateLabelColor: "#171717",
    stateLabelFontColor: "#171717",
    compositeBackground: "#f5f5f5",
    compositeTitleBackground: "#ffffff",
    compositeBorder: "#a3a3a3",
    taskTextDark: "#171717",
    taskTextLight: "#e7e7e7",
    gridColor: "#d4d4d4",
    sectionBkg: "#f5f5f5",
    altSectionBkg: "#fafafa",
    todayLineColor: "#171717",
    // Generic text
    textColor: "#171717",
    fontFamily: "inherit",
    fontSize: "14px",
  }
}

/**
 * Renders a Mermaid diagram client-side (mermaid needs DOM APIs).
 * Theme-aware: re-renders when the app's .dark class flips (next-themes).
 */
export function MermaidDiagram({ source, id, title }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const [rendered, setRendered] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [theme, setTheme] = useState<"dark" | "default">(() => detectTheme())

  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(detectTheme()))
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
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "loose",
          theme: "base",
          themeVariables: themeVariables(theme),
          flowchart: { htmlLabels: true, curve: "basis" },
          sequence: { useMaxWidth: true, mirrorActors: false },
          er: { useMaxWidth: true },
          state: { useMaxWidth: true },
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
