import type { Metadata } from "next"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
  title: "Project Notes — AI Teammates Docs",
  description:
    "Complete technical knowledge base for the AI Teammates repository: architecture, technology rationales, feature walkthroughs, and interview preparation.",
}

export default function DocsHome() {
  redirect("/docs/readme")
}
