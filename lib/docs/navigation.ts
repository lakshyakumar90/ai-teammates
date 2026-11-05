export type DocsNavItem = {
  slug: string
  title: string
  shortTitle: string
  order: number
}

export type DocsNavSection = {
  title: string
  items: DocsNavItem[]
}

export const DOCS_SECTIONS: DocsNavSection[] = [
  {
    title: "Overview",
    items: [
      {
        slug: "readme",
        title: "AI Teammates — Project Notes",
        shortTitle: "Project Notes",
        order: 0,
      },
      {
        slug: "01-project-overview",
        title: "01 — Project Overview",
        shortTitle: "Project Overview",
        order: 1,
      },
      {
        slug: "02-tech-stack-deep-dive",
        title: "02 — Tech Stack Deep Dive",
        shortTitle: "Tech Stack Deep Dive",
        order: 2,
      },
      {
        slug: "03-architecture-and-design-decisions",
        title: "03 — Architecture & Design Decisions",
        shortTitle: "Architecture & Design",
        order: 3,
      },
    ],
  },
  {
    title: "Reference",
    items: [
      {
        slug: "04-folder-and-file-reference",
        title: "04 — Folder & File Reference",
        shortTitle: "Folder & File Reference",
        order: 4,
      },
      {
        slug: "05-feature-and-code-walkthroughs",
        title: "05 — Feature & Code Walkthroughs",
        shortTitle: "Feature Walkthroughs",
        order: 5,
      },
      {
        slug: "06-database-and-data-models",
        title: "06 — Database & Data Models",
        shortTitle: "Database & Data Models",
        order: 6,
      },
      {
        slug: "08-api-and-realtime-workflows",
        title: "08 — API & Realtime Workflows",
        shortTitle: "API & Realtime",
        order: 8,
      },
    ],
  },
  {
    title: "Guides",
    items: [
      {
        slug: "07-authentication-and-security",
        title: "07 — Authentication & Security",
        shortTitle: "Authentication & Security",
        order: 7,
      },
      {
        slug: "09-testing-and-code-quality",
        title: "09 — Testing & Code Quality",
        shortTitle: "Testing & Code Quality",
        order: 9,
      },
      {
        slug: "10-development-and-deployment-guide",
        title: "10 — Development & Deployment Guide",
        shortTitle: "Development & Deployment",
        order: 10,
      },
      {
        slug: "12-build-from-scratch-guide",
        title: "12 — Build-From-Scratch Guide",
        shortTitle: "Build-From-Scratch",
        order: 12,
      },
    ],
  },
  {
    title: "Interview & Growth",
    items: [
      {
        slug: "11-interview-questions-and-answers",
        title: "11 — Interview Questions & Answers",
        shortTitle: "Interview Questions & Answers",
        order: 11,
      },
      {
        slug: "13-scalability-and-performance",
        title: "13 — Scalability & Performance",
        shortTitle: "Scalability & Performance",
        order: 13,
      },
      {
        slug: "14-improvements-and-technical-debt",
        title: "14 — Improvements & Technical Debt",
        shortTitle: "Improvements & Technical Debt",
        order: 14,
      },
      {
        slug: "16-improvements-playbook",
        title: "16 — Improvements Playbook",
        shortTitle: "Improvements Playbook",
        order: 16,
      },
      {
        slug: "15-glossary-and-quick-revision",
        title: "15 — Glossary & Quick Revision",
        shortTitle: "Glossary & Quick Revision",
        order: 15,
      },
    ],
  },
]

export const DOC_SLUGS: string[] = DOCS_SECTIONS.flatMap((s) =>
  s.items.map((i) => i.slug)
)

export const COMPUTER_ACCESS = "computer-use"

export function getNextPrev(slug: string): {
  prev: DocsNavItem | null
  next: DocsNavItem | null
} {
  const flat = DOCS_SECTIONS.flatMap((s) => s.items)
  const index = flat.findIndex((i) => i.slug === slug)
  if (index === -1) return { prev: null, next: null }
  return {
    prev: index > 0 ? flat[index - 1] : null,
    next: index < flat.length - 1 ? flat[index + 1] : null,
  }
}
