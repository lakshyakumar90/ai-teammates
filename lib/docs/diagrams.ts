export type DiagramEntry = {
  id: string
  title: string
  shortTitle: string
  description: string
  category: string
  group: string
  sourcePath: string
  relatedDoc?: string
}

export const DIAGRAMS: DiagramEntry[] = [
  {
    id: "system-architecture",
    title: "System Architecture",
    shortTitle: "System Architecture",
    description: "High-level system: browser, web app, worker, DB, and external services.",
    category: "Architecture",
    group: "core",
    sourcePath: "diagrams/system-architecture.mmd",
    relatedDoc: "03-architecture-and-design-decisions",
  },
  {
    id: "repository-architecture",
    title: "Repository Architecture",
    shortTitle: "Repository Architecture",
    description: "Folder/module dependency map — what depends on what.",
    category: "Architecture",
    group: "core",
    sourcePath: "diagrams/repository-architecture.mmd",
    relatedDoc: "04-folder-and-file-reference",
  },
  {
    id: "frontend-architecture",
    title: "Frontend Architecture",
    shortTitle: "Frontend Architecture",
    description: "Routes, layout gate, components, hooks, and state.",
    category: "Architecture",
    group: "core",
    sourcePath: "diagrams/frontend-architecture.mmd",
    relatedDoc: "05-feature-and-code-walkthroughs",
  },
  {
    id: "backend-architecture",
    title: "Backend Architecture",
    shortTitle: "Backend Architecture",
    description: "Server actions, policies, DB layer, worker tasks, and shared lib/.",
    category: "Architecture",
    group: "core",
    sourcePath: "diagrams/backend-architecture.mmd",
    relatedDoc: "03-architecture-and-design-decisions",
  },
  {
    id: "authentication-flow",
    title: "Authentication Flow",
    shortTitle: "Authentication Flow",
    description: "Sign-in, session, server-action, and worker authorization.",
    category: "Workflows",
    group: "flows",
    sourcePath: "diagrams/authentication-flow.mmd",
    relatedDoc: "07-authentication-and-security",
  },
  {
    id: "api-request-lifecycle",
    title: "API Request Lifecycle",
    shortTitle: "API Request Lifecycle",
    description: "Client → action → policy → DB/response for a mutating request.",
    category: "Workflows",
    group: "flows",
    sourcePath: "diagrams/api-request-lifecycle.mmd",
    relatedDoc: "08-api-and-realtime-workflows",
  },
  {
    id: "realtime-workflow",
    title: "Realtime Chat Workflow",
    shortTitle: "Realtime Chat Workflow",
    description: "Chat session, token minting, streaming, reconnect, and stop.",
    category: "Workflows",
    group: "flows",
    sourcePath: "diagrams/realtime-workflow.mmd",
    relatedDoc: "08-api-and-realtime-workflows",
  },
  {
    id: "deployment-workflow",
    title: "Deployment Workflow",
    shortTitle: "Deployment Workflow",
    description: "Dev → build → test → Vercel + Trigger.dev deploys.",
    category: "Workflows",
    group: "flows",
    sourcePath: "diagrams/deployment-workflow.mmd",
    relatedDoc: "10-development-and-deployment-guide",
  },
  {
    id: "database-er",
    title: "Database ER Diagram",
    shortTitle: "Database ER Diagram",
    description: "Entity-relationship diagram of all 13 tables and their relations.",
    category: "Data",
    group: "data",
    sourcePath: "diagrams/database-er.mmd",
    relatedDoc: "06-database-and-data-models",
  },
  {
    id: "feature/bot-creation",
    title: "Bot Creation Workflow",
    shortTitle: "Bot Creation",
    description: "Creating a bot: dialog → server action → sandbox → DB batch.",
    category: "Feature Workflows",
    group: "features",
    sourcePath: "diagrams/feature-workflows/bot-creation.mmd",
    relatedDoc: "05-feature-and-code-walkthroughs",
  },
  {
    id: "feature/chat-turn",
    title: "Chat Turn Workflow",
    shortTitle: "Chat Turn",
    description: "One message end-to-end: UI → session → worker → stream → render.",
    category: "Feature Workflows",
    group: "features",
    sourcePath: "diagrams/feature-workflows/chat-turn.mmd",
    relatedDoc: "05-feature-and-code-walkthroughs",
  },
  {
    id: "feature/group-handoff",
    title: "Group Handoff Workflow",
    shortTitle: "Group Handoff",
    description: "Bot-to-bot handoff inside a group chat turn.",
    category: "Feature Workflows",
    group: "features",
    sourcePath: "diagrams/feature-workflows/group-handoff.mmd",
    relatedDoc: "05-feature-and-code-walkthroughs",
  },
  {
    id: "feature/sandbox-lease",
    title: "Sandbox Lease Workflow",
    shortTitle: "Sandbox Lease",
    description: "Lease acquisition, reservation, and release for a sandbox.",
    category: "Feature Workflows",
    group: "features",
    sourcePath: "diagrams/feature-workflows/sandbox-lease.mmd",
    relatedDoc: "05-feature-and-code-walkthroughs",
  },
  {
    id: "feature/api-key-save",
    title: "API Key Save Workflow",
    shortTitle: "API Key Save",
    description: "Saving a personal provider key: validation → Clerk metadata.",
    category: "Feature Workflows",
    group: "features",
    sourcePath: "diagrams/feature-workflows/api-key-save.mmd",
    relatedDoc: "05-feature-and-code-walkthroughs",
  },
  {
    id: "feature/chatgpt-connect",
    title: "ChatGPT Connect Workflow",
    shortTitle: "ChatGPT Connect",
    description: "Hosted OAuth and community Codex connection flows.",
    category: "Feature Workflows",
    group: "features",
    sourcePath: "diagrams/feature-workflows/chatgpt-connect.mmd",
    relatedDoc: "05-feature-and-code-walkthroughs",
  },
]

export const DIAGRAM_IDS: string[] = DIAGRAMS.map((d) => d.id)

export function getDiagram(id: string): DiagramEntry | undefined {
  return DIAGRAMS.find((d) => d.id === id)
}

export function getSiblingDiagrams(id: string): {
  prev: DiagramEntry | null
  next: DiagramEntry | null
} {
  const index = DIAGRAMS.findIndex((d) => d.id === id)
  if (index === -1) return { prev: null, next: null }
  return {
    prev: index > 0 ? DIAGRAMS[index - 1] : null,
    next: index < DIAGRAMS.length - 1 ? DIAGRAMS[index + 1] : null,
  }
}
