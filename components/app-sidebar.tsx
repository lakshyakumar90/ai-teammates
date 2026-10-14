import { UserButton } from "@clerk/nextjs";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export function AppSidebar() {
  return (
    <Sidebar>
      <SidebarContent />
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              render={
                <UserButton
                  showName
                  appearance={{
                    elements: {
                      rootBox: "w-full",
                      userButtonBox: "w-full",
                      userButtonTrigger:
                        "flex! w-full! items-center! justify-start! gap-2! rounded-md! p-2! text-sm! hover:bg-sidebar-accent! hover:text-sidebar-accent-foreground! focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-hidden",
                      userButtonAvatarBox: "order-first size-8 shrink-0",
                      userButtonOuterIdentifier:
                        "order-last min-w-0 flex-1 truncate text-left text-sm text-sidebar-foreground",
                    },
                  }}
                />
              }
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
