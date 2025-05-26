
"use server";

import { revalidatePath } from "next/cache";

export interface ChatSession {
  id: string;
  userId?: string;
  promptId: string;
  messages: Array<{
    id: string;
    sender: "user" | "ai";
    text: string;
    timestamp: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

let chatSessions: ChatSession[] = [];

export async function saveChatSession(
  session: Omit<ChatSession, "id" | "createdAt" | "updatedAt">
) {
  try {
    const newSession: ChatSession = {
      ...session,
      id: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    chatSessions.push(newSession);


    console.log("Chat session saved:", newSession.id);

    revalidatePath("/chat");
    return { success: true, sessionId: newSession.id };
  } catch (error) {
    console.error("Failed to save chat session:", error);
    return { success: false, error: "Failed to save chat session" };
  }
}

export async function getChatSessions(userId?: string) {
  try {

    const sessions = userId
      ? chatSessions.filter((session) => session.userId === userId)
      : chatSessions;

    return {
      success: true,
      sessions: sessions.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      ),
    };
  } catch (error) {
    console.error("Failed to get chat sessions:", error);
    return {
      success: false,
      error: "Failed to load chat sessions",
      sessions: [],
    };
  }
}

export async function deleteChatSession(sessionId: string) {
  try {
    const index = chatSessions.findIndex((session) => session.id === sessionId);

    if (index === -1) {
      return { success: false, error: "Chat session not found" };
    }

    chatSessions.splice(index, 1);

    console.log("Chat session deleted:", sessionId);
    revalidatePath("/chat");
    return { success: true };
  } catch (error) {
    console.error("Failed to delete chat session:", error);
    return { success: false, error: "Failed to delete chat session" };
  }
}

export async function updateChatSession(
  sessionId: string,
  updates: Partial<ChatSession>
) {
  try {
    const index = chatSessions.findIndex((session) => session.id === sessionId);

    if (index === -1) {
      return { success: false, error: "Chat session not found" };
    }

    chatSessions[index] = {
      ...chatSessions[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    console.log("Chat session updated:", sessionId);
    revalidatePath("/chat");
    return { success: true, session: chatSessions[index] };
  } catch (error) {
    console.error("Failed to update chat session:", error);
    return { success: false, error: "Failed to update chat session" };
  }
}


export async function logChatInteraction(data: {
  promptId: string;
  messageLength: number;
  responseTime?: number;
  userId?: string;
}) {
  try {

    console.log("Chat interaction logged:", {
      ...data,
      timestamp: new Date().toISOString(),
    });

    return { success: true };
  } catch (error) {
    console.error("Failed to log chat interaction:", error);
    return { success: false, error: "Failed to log interaction" };
  }
}

export async function getPromptUsageStats() {
  try {
    const stats = chatSessions.reduce((acc, session) => {
      const promptId = session.promptId;
      acc[promptId] = (acc[promptId] || 0) + session.messages.length;
      return acc;
    }, {} as Record<string, number>);

    return { success: true, stats };
  } catch (error) {
    console.error("Failed to get prompt usage stats:", error);
    return { success: false, error: "Failed to get usage stats", stats: {} };
  }
}
