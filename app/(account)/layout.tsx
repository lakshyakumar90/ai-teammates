import { WorkspaceLayout } from "@/components/workspace-layout"

export default function AccountLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <WorkspaceLayout accountPage>{children}</WorkspaceLayout>
}
