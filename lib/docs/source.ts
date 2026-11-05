import "server-only"
import fs from "node:fs"
import path from "node:path"

/** Read a doc markdown file from docs/project-notes/ by slug. */
export function readDoc(slug: string): string | null {
  const base = path.join(process.cwd(), "docs", "project-notes")
  // README maps to readme; everything else 00-16 files.
  const filename = slug === "readme" ? "README.md" : `${slug}.md`
  const filePath = path.join(base, filename)
  // Guard against path traversal
  if (!filePath.startsWith(base)) return null
  try {
    if (!fs.existsSync(filePath)) return null
    let content = fs.readFileSync(filePath, "utf-8")
    // Rewrite .mmd diagram links to inline mermaid blocks so they render
    // on the docs site. Links look like ([label](diagrams/name.mmd)) or
    // ([label](diagrams/feature-workflows/name.mmd)).
    content = content.replace(
      /\[([^\]]*)\]\((diagrams\/[^)\s]+\.mmd)\)/g,
      (_match, label: string, rel: string) => {
        const mmdPath = path.join(base, rel.replace(/\//g, path.sep))
        try {
          if (fs.existsSync(mmdPath)) {
            const diagram = fs.readFileSync(mmdPath, "utf-8").trim()
            return `\n\n**${label}**\n\n\`\`\`mermaid\n${diagram}\n\`\`\`\n\n`
          }
        } catch {
          // fall through to link
        }
        return _match
      }
    )
    return content
  } catch {
    return null
  }
}

/** Read a mermaid diagram source from docs/project-notes/diagrams/. */
export function readDiagram(id: string): string | null {
  const base = path.join(process.cwd(), "docs", "project-notes", "diagrams")
  const filePath = path.join(base, `${id}.mmd`)
  if (!filePath.startsWith(base)) return null
  try {
    if (!fs.existsSync(filePath)) return null
    return fs.readFileSync(filePath, "utf-8")
  } catch {
    return null
  }
}

export function listDiagrams(): string[] {
  const base = path.join(process.cwd(), "docs", "project-notes", "diagrams")
  if (!fs.existsSync(base)) return []
  return fs
    .readdirSync(base)
    .filter((f) => f.endsWith(".mmd"))
    .map((f) => path.basename(f, ".mmd"))
}
