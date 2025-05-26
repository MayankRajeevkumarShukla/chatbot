// hooks/useChatbot.ts
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { GoogleGenerativeAI, Part, Content } from "@google/generative-ai";
import { PROMPTS } from "@/lib/prompts";
import { ChatbotActions, ChatbotState, Message, Prompt } from "@/types";



const API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY;

if (!API_KEY) {
  throw new Error("NEXT_PUBLIC_GEMINI_API_KEY is not defined");
}

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash-latest",
});



export function useChatbot(initialPromptIdFromCookie: string | undefined): ChatbotState & ChatbotActions {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPrompt, setSelectedPrompt] = useState<Prompt>(PROMPTS[0]);

  const chatRef = useRef<ReturnType<typeof model.startChat> | null>(null);
  const messageIdCounter = useRef(0);

  const generateMessageId = useCallback(() => {
    return `msg_${Date.now()}_${++messageIdCounter.current}`;
  }, []);

  const initializeChat = useCallback(
    (promptToInit: Prompt, existingMessages?: Message[]) => {
      setIsLoading(true);
      setError(null);
      try {
        console.log(
          "Initializing/Updating chat with prompt:",
          promptToInit.name,
          "Existing messages count:",
          existingMessages?.length || 0
        );

        const systemInstructionPayload: Content = {
          parts: [{ text: promptToInit.text.trim() }],
          role: ""
        };

        console.log(
          "System instruction (Content object) for startChat:",
          JSON.stringify(systemInstructionPayload)
        );

        let historyForGemini: Content[] = [];
        let firstUserMessageIndex = -1; // Declared at a higher scope and initialized

        if (existingMessages && existingMessages.length > 0) {
          firstUserMessageIndex = existingMessages.findIndex(
            (msg) => msg.sender === "user"
          ); // Assigned here

          if (firstUserMessageIndex !== -1) {
            historyForGemini = existingMessages
              .slice(firstUserMessageIndex)
              .filter((msg) => {
                if (msg.sender === "user") return true;
                if (
                  msg.sender === "ai" &&
                  msg.text.trim() !== "" &&
                  !msg.text.startsWith("Sorry, an error occurred") &&
                  msg.text.trim() !== promptToInit.greeting
                )
                  return true;
                return false;
              })
              .map((message) => ({
                parts: [{ text: message.text }],
                role: message.sender === "user" ? "user" : "model",
              }));

            if (
              historyForGemini.length > 0 &&
              historyForGemini[0].role === "model"
            ) {
              console.warn(
                "History construction resulted in 'model' as first message. Attempting to correct or clear."
              );
              const actualFirstUserInHistory = historyForGemini.findIndex(
                (h) => h.role === "user"
              );
              if (actualFirstUserInHistory !== -1) {
                historyForGemini = historyForGemini.slice(
                  actualFirstUserInHistory
                );
              } else {
                historyForGemini = [];
              }
            }
          } else {
            console.log(
              "No user messages in existingMessages. Initializing with empty history for Gemini."
            );
          }
        }

        if (historyForGemini.length > 0) {
          console.log(
            "Re-initializing with history for Gemini:",
            historyForGemini.map((h) => ({
              role: h.role,
              textLength: h.parts[0]?.text?.length ?? 0,
              textStart: h.parts[0]?.text
                ? h.parts[0]?.text?.substring(0, 50) +
                  (h.parts[0]?.text?.length > 50 ? "..." : "")
                : "",
            }))
          );
        } else {
          console.log(
            "No valid history to pass to Gemini for re-initialization or it's a fresh start."
          );
        }

        chatRef.current = model.startChat({
          history: historyForGemini,
          generationConfig: {
            maxOutputTokens: 8192,
          },
          systemInstruction: systemInstructionPayload,
        });

        // This condition now safely uses firstUserMessageIndex
        if (
          !existingMessages ||
          existingMessages.length === 0 ||
          (historyForGemini.length === 0 && firstUserMessageIndex === -1)
        ) {
          const greetingMessage: Message = {
            id: generateMessageId(),
            sender: "ai",
            text: promptToInit.greeting,
            timestamp: new Date(),
          };
          setMessages([greetingMessage]);
        } else if (existingMessages) {
          setMessages(existingMessages);
        }
        console.log("Chat initialized/updated successfully.");
      } catch (err) {
        console.error("Failed to initialize/update chat:", err);
        let detailedErrorMessage =
          "Failed to initialize/update chat session. Check console for details.";
        if (err instanceof Error) {
          detailedErrorMessage = `Failed to initialize/update chat session: ${err.message}`;
        } else if (typeof err === "string") {
          detailedErrorMessage = `Failed to initialize/update chat session: ${err}`;
        }
        setError(detailedErrorMessage);
        if (!existingMessages || existingMessages.length === 0) {
          setMessages([]);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [generateMessageId]
  );

  const sendMessage = useCallback(
    async (messageText: string) => {
      if (!messageText.trim() || isLoading) return;

      const userMessage: Message = {
        id: generateMessageId(),
        sender: "user",
        text: messageText.trim(),
        timestamp: new Date(),
      };

      const messagesAtSendStart = [...messages];

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);
      setError(null);

      const aiMessageId = generateMessageId();
      const initialAiMessage: Message = {
        id: aiMessageId,
        sender: "ai",
        text: "",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, initialAiMessage]);

      try {
        if (!chatRef.current) {
          console.warn(
            "Chat session not initialized in sendMessage. Attempting to re-initialize with history."
          );
          initializeChat(selectedPrompt, messagesAtSendStart);
          if (!chatRef.current) {
            setIsLoading(false);
            setMessages(messagesAtSendStart);
            return;
          }
        }

        const streamResult = await chatRef.current.sendMessageStream(
          messageText.trim()
        );

        let accumulatedText = "";
        for await (const chunk of streamResult.stream) {
          if (chunk && typeof chunk.text === "function") {
            const chunkText = chunk.text();
            accumulatedText += chunkText;
            setMessages((prevMessages) =>
              prevMessages.map((msg) =>
                msg.id === aiMessageId ? { ...msg, text: accumulatedText } : msg
              )
            );
          }
        }

        const finalResponse = await streamResult.response;
        const finalText = finalResponse?.text()?.trim() || "";

        if (finalText || accumulatedText.trim()) {
          setMessages((prevMessages) =>
            prevMessages.map((msg) =>
              msg.id === aiMessageId
                ? { ...msg, text: finalText || accumulatedText.trim() }
                : msg
            )
          );
        } else {
          setMessages((prevMessages) =>
            prevMessages.map((msg) =>
              msg.id === aiMessageId
                ? { ...msg, text: "[No text in response]" }
                : msg
            )
          );
        }
      } catch (err) {
        console.error("Error sending message:", err);
        const errorMessageText =
          err instanceof Error ? err.message : "Unknown error sending message";
        setError(`Failed to get response: ${errorMessageText}`);

        setMessages((prevMessages) =>
          prevMessages.map((msg) =>
            msg.id === aiMessageId
              ? {
                  ...msg,
                  text: `Sorry, an error occurred: ${errorMessageText}. Please try again.`,
                }
              : msg
          )
        );
      } finally {
        setIsLoading(false);
      }
    },
    [
      isLoading,
      generateMessageId,
      initializeChat,
      selectedPrompt,
      messages,
      error,
    ]
  );

  const changePrompt = useCallback(
    (promptId: string) => {
      const newPrompt = PROMPTS.find((p) => p.id === promptId);
      if (!newPrompt) {
        console.error(`Prompt with id ${promptId} not found`);
        setError(`Prompt with id ${promptId} not found. Using current prompt.`);
        return;
      }
      if (newPrompt.id === selectedPrompt.id) {
        console.log("Prompt already selected:", newPrompt.name);
        return;
      }

      console.log("Changing prompt to:", newPrompt.name);
      setSelectedPrompt(newPrompt);
      initializeChat(newPrompt, messages);
    },
    [initializeChat, messages, selectedPrompt.id]
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const resetChat = useCallback(() => {
    console.log("Resetting chat with prompt:", selectedPrompt.name);
    initializeChat(selectedPrompt);
  }, [selectedPrompt, initializeChat]);

  useEffect(() => {
    if (selectedPrompt && (!chatRef.current || messages.length === 0)) {
      console.log("Initial mount: initializing chat with selected prompt.");
      initializeChat(selectedPrompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPrompt, initializeChat]); // initializeChat is now stable if its own deps are stable

  return {
    messages,
    isLoading,
    error,
    selectedPrompt,
    sendMessage,
    changePrompt,
    clearError,
    resetChat,
  };
}
