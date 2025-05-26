"use client";

import { useState, useEffect, useRef, useCallback, KeyboardEvent } from "react";
import Cookies from "js-cookie";
import { useChatbot } from "@/hooks/useChatbot";
import {
  saveChatSession,
  logChatInteraction,
} from "@/lib/actions/chat-actions";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PROMPTS } from "@/lib/prompts";
import { Message as ChatMessage } from "@/types";

const COOKIE_NAME = "selectedPromptId";

// Reverted to the original simpler dropdown arrow
const DropdownArrow = ({ className }: { className?: string }) => (
  <div
    className={
      className ||
      "absolute right-1 sm:right-2 top-1/2 -translate-y-1/2 pointer-events-none text-black text-xs"
    }
  >
    ▼
  </div>
);

export default function ChatPage() {
  let initialPromptIdFromCookie: string | undefined;
  if (typeof window !== "undefined") {
    initialPromptIdFromCookie = Cookies.get(COOKIE_NAME);
  }

  const {
    messages,
    isLoading,
    error,
    selectedPrompt,
    sendMessage,
    changePrompt,
    clearError,
    resetChat,
  } = useChatbot(initialPromptIdFromCookie);

  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedPrompt && typeof window !== "undefined") {
      Cookies.set(COOKIE_NAME, selectedPrompt.id, { expires: 365, path: "/" });
    }
  }, [selectedPrompt]);

  useEffect(() => {
    const lastMessageIsAI =
      messages.length > 0 && messages[messages.length - 1].sender === "ai";
    if (!isLoading && lastMessageIsAI && !error) {
      inputRef.current?.focus();
    }
  }, [isLoading, messages, error]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };
    if (isDropdownOpen)
      document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isDropdownOpen]);

  const handleSendMessage = useCallback(async () => {
    if (input.trim() === "" || isLoading) return;
    const messageText = input.trim();
    setInput("");
    const startTime = Date.now();
    await sendMessage(messageText);
    if (selectedPrompt) {
      const responseTime = Date.now() - startTime;
      await logChatInteraction({
        promptId: selectedPrompt.id,
        messageLength: messageText.length,
        responseTime,
      });
    }
  }, [input, isLoading, sendMessage, selectedPrompt]);

  const handleKeyPress = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handlePromptSelect = (promptId: string) => {
    changePrompt(promptId);
    setIsDropdownOpen(false);
  };

  useEffect(() => {
    if (messages.length > 1 && selectedPrompt) {
      const saveSession = async () => {
        try {
          await saveChatSession({
            promptId: selectedPrompt.id,
            messages: messages.map((msg: ChatMessage) => ({
              ...msg,
              timestamp:
                msg.timestamp instanceof Date
                  ? msg.timestamp.toISOString()
                  : new Date(msg.timestamp).toISOString(),
            })),
          });
        } catch (e) {
          console.error("Failed to save chat session:", e);
        }
      };
      const timeoutId = setTimeout(saveSession, 2000);
      return () => clearTimeout(timeoutId);
    }
  }, [messages, selectedPrompt]);

  if (!selectedPrompt) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div>Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      {/* Main Chat Container - Boxy */}
      <div className="bg-white border border-black w-full max-w-[500px] h-[700px] flex flex-col overflow-hidden shadow-lg">
        {/* Header - Boxy */}
        <div className="bg-black text-white px-2 sm:px-4 py-2 sm:py-3 flex items-center shrink-0 relative">
          {/* Custom Dropdown - Boxy */}
          <div ref={dropdownRef} className="relative flex-shrink-0">
            <button
              type="button"
              onClick={() => !isLoading && setIsDropdownOpen(!isDropdownOpen)}
              disabled={isLoading}
              // Reverted to original select-like styling, keeping custom functionality
              className="bg-white text-black border border-gray-300 px-1 sm:px-2 py-1 text-xs sm:text-sm focus:outline-none focus:ring-1 focus:ring-black cursor-pointer disabled:opacity-50 pr-6 sm:pr-8 relative text-left w-[120px] sm:w-[150px]"
            >
              <span className="truncate block">
                {" "}
                {/* Block for proper truncation */}
                {selectedPrompt.name}
              </span>
              <DropdownArrow
                className={`absolute right-1 sm:right-2 top-1/2 -translate-y-1/2 pointer-events-none text-black text-xs transform transition-transform duration-200 ease-in-out ${
                  isDropdownOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {/* Dropdown Panel - Boxy with animation */}
            <div
              className={`absolute z-20 mt-0.5 w-full bg-white border border-black 
                          max-h-60 overflow-y-auto shadow-md 
                          transform transition-all duration-150 ease-out
                          ${
                            isDropdownOpen
                          ? "opacity-100 scale-y-100"
                              : "opacity-0 scale-y-95 pointer-events-none"
                          }`}
              style={{ transformOrigin: "top" }} // For scale-y animation
            >
              {PROMPTS.map((prompt) => (
                <button
                  key={prompt.id}
                  onClick={() => handlePromptSelect(prompt.id)}
                  className={`block w-full text-left px-2 py-1.5 text-xs sm:text-sm focus:outline-none transition-colors
                              ${
                                selectedPrompt.id === prompt.id
                                  ? "bg-black text-white"
                                  : "text-black hover:bg-gray-200 focus:bg-gray-300"
                              }`}
                  role="menuitem"
                >
                  {prompt.name}
                </button>
              ))}
            </div>
          </div>

          {/* Centered Title - Responsive */}
          <div className="flex-grow flex justify-center px-2">
            <h1 className="text-sm sm:text-lg font-medium text-center truncate">
              <span className="hidden sm:inline">Sahil Gulihar's Chatbot</span>
              <span className="sm:hidden">SG's Chatbot</span>
            </h1>
          </div>

          {/* Reset button - Boxy */}
          <div className="flex-shrink-0">
            <button
              onClick={resetChat}
              disabled={isLoading}
              className="px-2 sm:px-3 py-1 text-xs sm:text-sm bg-transparent border border-white text-white hover:bg-white hover:text-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Chat Window - Boxy messages */}
        <div className="flex-grow p-4 overflow-y-auto flex flex-col gap-3 bg-white">
          {" "}
          {/* Original bg-white */}
          {messages.map((message) => {
            const isUser = message.sender === "user";
            return (
              <div
                key={message.id}
                className={`max-w-[85%] p-3 border border-black text-sm leading-relaxed break-words ${
                  // Original border-black
                  isUser
                    ? "self-end bg-black text-white"
                    : "self-start bg-white text-black" // Original self-start styles
                }`}
              >
                {/* Using div for Markdown to avoid <p> inside <p> warnings if Markdown itself generates <p> */}
                <div className="whitespace-pre-wrap prose prose-sm max-w-none text-inherit">
                  <Markdown remarkPlugins={[remarkGfm]}>
                    {message.text === "" && message.sender === "ai" && isLoading
                      ? "..."
                      : message.text}
                  </Markdown>
                </div>
              </div>
            );
          })}
          {error && (
            <div className="max-w-[85%] p-3 border-2 border-red-500 text-sm leading-relaxed break-words self-center text-center bg-red-50 text-red-700">
              <p className="m-0 mb-2 font-medium">{error}</p>
              <button
                onClick={clearError}
                className="text-xs px-2 py-1 bg-red-100 hover:bg-red-200 border border-red-300 transition-colors"
              >
                Dismiss
              </button>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area - Boxy */}
        <div className="flex p-4 bg-white border-t border-black gap-3 shrink-0">
          {" "}
          {/* Original borders and bg */}
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your message..."
            disabled={isLoading}
            rows={2}
            className="flex-grow p-3 border border-black text-sm resize-none min-h-[60px] max-h-[120px] overflow-y-auto bg-white text-black placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-black disabled:opacity-50" // Original styles
            style={{ fontFamily: "Arial, sans-serif" }}
          />
          <button
            onClick={handleSendMessage}
            disabled={isLoading || input.trim() === ""}
            className="px-6 py-3 bg-gray-500 text-white border border-gray-500 text-sm font-medium hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0 flex items-center justify-center" // Original styles, added flex for spinner
          >
            {isLoading ? (
              <svg
                className="animate-spin h-5 w-5 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
            ) : (
              "Send"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
