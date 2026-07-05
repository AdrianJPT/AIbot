import { ConversationsShell } from "@/features/conversations/containers/conversations-shell";

export default function ConversationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ConversationsShell>{children}</ConversationsShell>;
}
