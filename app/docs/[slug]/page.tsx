import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { readDoc } from "@/lib/docs/source"
import { DOC_SLUGS, DOCS_SECTIONS } from "@/lib/docs/navigation"
import { Markdown } from "@/components/docs/markdown"
import { DocsNextPrev } from "@/components/docs/docs-next-prev"

export function generateStaticParams() {
  return DOC_SLUGS.map((slug) => ({ slug }))
}

export const dynamic = "force-static"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const item = DOCS_SECTIONS.flatMap((s) => s.items).find((i) => i.slug === slug)
  return {
    title: item ? `${item.title} — AI Teammates Docs` : "AI Teammates Docs",
    description: `AI Teammates project documentation: ${item?.title ?? slug}`,
  }
}

export default async function DocsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  if (!DOC_SLUGS.includes(slug)) notFound()

  const source = readDoc(slug)
  if (!source) notFound()

  const item = DOCS_SECTIONS.flatMap((s) => s.items).find((i) => i.slug === slug)

  return (
    <article className="docs-article">
      <div className="docs-article-breadcrumb" aria-label="Breadcrumb">
        <span>Documentation</span>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{item?.shortTitle ?? slug}</span>
      </div>
      <Markdown source={source} />
      <DocsNextPrev slug={slug} />
    </article>
  )
}
