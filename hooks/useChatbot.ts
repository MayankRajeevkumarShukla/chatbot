
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
  model: "gemini-2.5-flash",
});


const getInitialSelectedPrompt = (
  cookiePromptId: string | undefined
): Prompt => {
  if (cookiePromptId) {
    const promptFromCookie = PROMPTS.find((p) => p.id === cookiePromptId);
    if (promptFromCookie) {
      console.log(
        "[useChatbot] Initializing selectedPrompt from cookie:",
        promptFromCookie.name
      );
      return promptFromCookie;
    }
    console.warn(
      `[useChatbot] Prompt ID "${cookiePromptId}" from cookie not found. Falling back to default.`
    );
  }

  if (PROMPTS.length > 0) {
    console.log(
      "[useChatbot] Initializing selectedPrompt with default:",
      PROMPTS[0].name
    );
    return PROMPTS[0];
  }

  console.error(
    "[useChatbot] PROMPTS array is empty. Cannot select an initial prompt."
  );

  return {
    id: "error_no_prompts",
    name: "Error",
    text: "No prompts configured.",
    greeting: "Error: Chatbot cannot be initialized without prompts.",
  };
};

export function useChatbot(
  initialPromptIdFromCookie: string | undefined
): ChatbotState & ChatbotActions {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);


  const [selectedPrompt, setSelectedPrompt] = useState<Prompt>(() =>
    getInitialSelectedPrompt(initialPromptIdFromCookie)
  );

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
          "[useChatbot] Initializing/Updating chat with prompt:",
          promptToInit.name,
          "Existing messages count:",
          existingMessages?.length || 0
        );

   
        const systemInstructionForGemini: Content = {
          parts: [{ text: promptToInit.text.trim() }],
          role: "system", 
        };

        console.log(
          "[useChatbot] System instruction for startChat:",
          JSON.stringify(systemInstructionForGemini)
        );

        let historyForGemini: Content[] = [];
        let firstUserMessageIndex = -1;

        if (existingMessages && existingMessages.length > 0) {
          firstUserMessageIndex = existingMessages.findIndex(
            (msg) => msg.sender === "user"
          );

          if (firstUserMessageIndex !== -1) {
            const relevantMessages = existingMessages.slice(firstUserMessageIndex);
            const mappedHistory = relevantMessages
              .map((message) => ({
                parts: [{ text: message.text }],
                role: message.sender === "user" ? "user" : "model",
              }));


            let currentExpectedRole = "user";
            for (const msg of mappedHistory) {

              if (msg.role === "model" && 
                 (msg.parts[0].text.trim() === "" || 
                  msg.parts[0].text.trim() === promptToInit.greeting ||
                  msg.parts[0].text.startsWith("Sorry, an error occurred"))) {
                console.log("[useChatbot] Skipping empty/greeting/error AI message from history construction:", msg.parts[0].text.substring(0,30));
                continue;
              }

              if (msg.role === currentExpectedRole) {
                historyForGemini.push(msg);
                currentExpectedRole = currentExpectedRole === "user" ? "model" : "user";
              } else {
                console.warn(
                  `[useChatbot] History role mismatch. Expected ${currentExpectedRole}, got ${msg.role}. Truncating history here.`
                );
                break; 
              }
            }
          } else {
            console.log(
              "[useChatbot] No user messages in existingMessages. Initializing with empty history for Gemini."
            );
          }
        }

        if (historyForGemini.length > 0) {
          console.log(
            "[useChatbot] Re-initializing with history for Gemini:",
            historyForGemini.map((h) => ({
              role: h.role,
              textLength: h.parts[0]?.text?.length ?? 0,
              textStart: (h.parts[0]?.text || "").substring(0, 50) + "...",
            }))
          );
        } else {
          console.log(
            "[useChatbot] No valid history for Gemini or fresh start."
          );
        }
        
        chatRef.current = null; 

        chatRef.current = model.startChat({
          history: historyForGemini,
          generationConfig: {
            maxOutputTokens: 8192,
          },
          systemInstruction: systemInstructionForGemini,
        });


        if (!existingMessages || existingMessages.length === 0 || (historyForGemini.length === 0 && firstUserMessageIndex === -1)) {

          const greetingMessage: Message = {
            id: generateMessageId(),
            sender: "ai",
            text: promptToInit.greeting,
            timestamp: new Date(),
          };
          setMessages([greetingMessage]);
        } else {

          setMessages([...existingMessages]);
        }
        console.log("[useChatbot] Chat initialized/updated successfully.");
      } catch (err) {
        console.error("[useChatbot] Failed to initialize/update chat:", err);
        const errorMsg = err instanceof Error ? err.message : String(err);
        setError(`Failed to initialize/update chat: ${errorMsg}`);
        if (!existingMessages || existingMessages.length === 0) {
          setMessages([]); 
        }
      } finally {
        setIsLoading(false);
      }
    },
    [generateMessageId] // Keep dependencies minimal for initializeChat stability
  );

  useEffect(() => {

    if (selectedPrompt && selectedPrompt.id !== "error_no_prompts") {

      if (!chatRef.current || messages.length === 0) {
        console.log(
          `[useChatbot] useEffect [selectedPrompt]: Initializing chat for prompt "${selectedPrompt.name}".`
        );
        initializeChat(selectedPrompt); 
      }
    }

  }, [selectedPrompt, initializeChat, messages.length]); 


  const sendMessage = useCallback(
    async (messageText: string) => {
      if (!messageText.trim() || isLoading) return;

      const userMessage: Message = {
        id: generateMessageId(),
        sender: "user",
        text: messageText.trim(),
        timestamp: new Date(),
      };
      
      const currentMessages = [...messages]; 

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
            "[useChatbot] sendMessage: Chat session not initialized. Attempting to re-initialize with history."
          );

          initializeChat(selectedPrompt, [...currentMessages, userMessage]);
          if (!chatRef.current) {

            setMessages(currentMessages);
            setError("Chat session could not be re-initialized. Please try resetting.");
            setIsLoading(false);
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
        console.error("[useChatbot] Error sending message:", err);
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
    ]
  );

  const changePrompt = useCallback(
    (promptId: string) => {
      const newPrompt = PROMPTS.find((p) => p.id === promptId);
      if (!newPrompt) {
        console.error(`[useChatbot] Prompt with id ${promptId} not found`);
        setError(`Prompt with id ${promptId} not found. Using current prompt.`);
        return;
      }
      if (newPrompt.id === selectedPrompt.id) {
        console.log("[useChatbot] Prompt already selected:", newPrompt.name);
        return;
      }

      console.log("[useChatbot] Changing prompt to:", newPrompt.name);
      setSelectedPrompt(newPrompt);

      initializeChat(newPrompt, messages);
    },
    [initializeChat, messages, selectedPrompt.id] 
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const resetChat = useCallback(() => {
    console.log("[useChatbot] Resetting chat with prompt:", selectedPrompt.name);
    setMessages([]); 
    chatRef.current = null; 
    initializeChat(selectedPrompt);
  }, [selectedPrompt, initializeChat]);

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