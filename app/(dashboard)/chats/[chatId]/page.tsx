import { ChatHeader } from "@/components/chat-header";
import { getChat } from "@/queries/chats";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ chatId: string }>;
}) {
  const { chatId } = await params;
  const chat = await getChat(chatId);
  const bot = chat?.members[0]?.bot;
  if (!chat || !bot) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1 p-6 text-center">
        <p className="text-lg font-medium">Invalid chat ID</p>
        <p className="text-sm text-muted-foreground">
          This chat doesn&apos;t exist or its bot was deleted.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ChatHeader
        title={chat.name ?? bot.name}
        avatarSeed={bot.avatar}
        bot={bot}
      />
    </div>
  );
}
