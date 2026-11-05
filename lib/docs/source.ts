import "server-only"
import fs from "node:fs"
import path from "node:path"

/** Read a doc markdown file from docs/project-notes/ by slug. */
export function readDoc(slug: string): string | null {
  const base = path.join(process.cwd(), "docs", "project-notes")
  const filename = slug === "readme" ? "README.md" : `${slug}.md`
  const filePath = path.join(base, filename)
  if (!filePath.startsWith(base)) return null
  try {
    if (!fs.existsSync(filePath)) return null
    let content = fs.readFileSync(filePath, "utf-8")
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
          // fall through
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
  const found = new Set<string>()
  const walk = (dir: string, prefix: string) => {
    if (!fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(path.join(dir, entry.name), `${prefix}${entry.name}/`)
      else if (entry.isFile() && entry.name.endsWith(".mmd")) {
        found.add(`${prefix}${path.basename(entry.name, ".mmd")}`)
      }
    }
  }
  walk(base, "")
  return Array.from(found).sort()
}
