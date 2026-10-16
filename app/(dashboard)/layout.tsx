import { cookies } from "next/headers"
import { auth } from "@clerk/nextjs/server"

import { AppSidebar } from "@/components/app-sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { getBots, getChats } from "@/queries/bots"

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  await auth.protect()
  const [chats, bots] = await Promise.all([getChats(), getBots()])
  const cookieStore = await cookies()
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false"

  return (
    <SidebarProvider
      defaultOpen={defaultOpen}
      className="h-dvh min-h-0 overflow-hidden"
    >
      <AppSidebar chats={chats} bots={bots} />
      <SidebarInset className="min-h-0 min-w-0 overflow-x-hidden overflow-y-auto">
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}
