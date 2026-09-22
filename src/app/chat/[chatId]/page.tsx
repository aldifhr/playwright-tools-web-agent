"use client";

import { useParams } from "next/navigation";
import Chat from "@/components/Chat";

export default function ChatDetailPage() {
  const params = useParams<{ chatId: string }>();
  return <Chat sessionId={params.chatId} />;
}
