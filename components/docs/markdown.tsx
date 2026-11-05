"use client"

import type { ComponentPropsWithoutRef } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeSlug from "rehype-slug"
import rehypeRaw from "rehype-raw"
import Link from "next/link"
import { MermaidDiagram } from "./mermaid-diagram"

/**
 * Convert a markdown link target to a docs-site href when it points
 * at another file in docs/project-notes/ (e.g. 02-tech-stack-deep-dive.md,
 * README.md, ../../PRODUCT.md).
 */
function docsHref(href: string | undefined): string | undefined {
  if (!href) return undefined
  const trimmed = href.trim()
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("mailto:") ||
    trimmed.startsWith("tel:")
  ) {
    return href
  }
  if (trimmed.startsWith("#")) return href

  const [pathPart, hashPart] = trimmed.split("#", 2)
  const base =
    pathPart
      .replace(/^\.\.[/\\]+/, "")
      .replace(/\.md$/i, "")
      .split("/").pop() ?? ""
  if (!base) return href
  const slug = base === "README" ? "readme" : base
  return `/docs/${slug}${hashPart ? `#${hashPart}` : ""}`
}

function isExternal(href: string | undefined): boolean {
  return !!href && /^https?:|^mailto:|^tel:/.test(href)
}

export function Markdown({ source }: { source: string }) {
  return (
    <div className="docs-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug, rehypeRaw]}
        components={{
          a({
            href,
            children,
            node: _node,
            ...props
          }: ComponentPropsWithoutRef<"a"> & { node?: unknown }) {
            const target = docsHref(href)
            if (!target) {
              return (
                <a href={href} {...props}>
                  {children}
                </a>
              )
            }
            if (isExternal(target)) {
              return (
                <a href={target} target="_blank" rel="noopener noreferrer" {...props}>
                  {children}
                </a>
              )
            }
            return (
              <Link href={target} {...props}>
                {children}
              </Link>
            )
          },
          code({
            className,
            children,
            node: _node,
            ...props
          }: ComponentPropsWithoutRef<"code"> & { node?: unknown }) {
            if (/language-mermaid/.test(className || "")) {
              return (
                <MermaidDiagram
                  source={String(children ?? "").replace(/\n$/, "")}
                  id="inline"
                />
              )
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            )
          },
          pre({
            children,
          }: ComponentPropsWithoutRef<"pre"> & { node?: unknown }) {
            return <pre>{children}</pre>
          },
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  )
}
