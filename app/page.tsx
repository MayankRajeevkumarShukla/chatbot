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
import html2canvas from "html2canvas";

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
  const [isEnhancing, setIsEnhancing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedPrompt && typeof window !== "undefined") {
      Cookies.set(COOKIE_NAME, selectedPrompt.id, { expires: 365, path: "/" });
    }
  }, [selectedPrompt]);

  useEffect(() => {
    const lastMessageIsAI =
      messages.length > 0 && messages[messages.length - 1].sender === "ai";
    if (!isLoading && !isEnhancing && lastMessageIsAI && !error) {
      inputRef.current?.focus();
    }
  }, [isLoading, isEnhancing, messages, error]);

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
    if (input.trim() === "" || isLoading || isEnhancing) return;
    
    const messageText = input.trim();
    setInput("");
    setIsEnhancing(true);
    
    const startTime = Date.now();
    
    try {
      await sendMessage(messageText);
      
      if (selectedPrompt) {
        const responseTime = Date.now() - startTime;
        await logChatInteraction({
          promptId: selectedPrompt.id,
          messageLength: messageText.length,
          responseTime,
        });
      }
    } catch (error) {
      console.error("Error sending message:", error);
    } finally {
      setIsEnhancing(false);
    }
  }, [input, isLoading, isEnhancing, sendMessage, selectedPrompt]);

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

  const handleShare = useCallback(async () => {
    if (!chatContainerRef.current || messages.length === 0) {
      return;
    }

    const chatContainer = chatContainerRef.current;
    const chatWindow = chatContainer.querySelector(
      ".chat-window"
    ) as HTMLElement | null;

    if (!chatWindow) {
      console.error(
        "Chat window element not found. Cannot proceed with share."
      );
      alert(
        "Failed to capture chat due to an internal error. Please try again."
      );
      return;
    }

    setIsSharing(true);

    const originalContainerStyleAttr = chatContainer.getAttribute("style");
    const originalWindowStyleAttr = chatWindow.getAttribute("style");
    const originalContainerClass = chatContainer.className;
    const originalWindowClass = chatWindow.className;

    try {
      chatContainer.style.height = "auto";
      chatContainer.style.maxHeight = "none";
      chatContainer.style.minHeight = "auto";

      chatWindow.style.height = "auto";
      chatWindow.style.maxHeight = "none";
      chatWindow.style.overflow = "visible";
      chatWindow.style.overflowY = "visible";
      chatWindow.style.flexGrow = "0";
      chatWindow.style.flexShrink = "0";

      chatContainer.offsetHeight;
      chatWindow.offsetHeight;

      await new Promise((resolve) => setTimeout(resolve, 150));

      const containerRect = chatContainer.getBoundingClientRect();

      const canvas = await html2canvas(chatContainer, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        allowTaint: true,
        scrollX: 0,
        scrollY: 0,
        width: containerRect.width,
        height: containerRect.height,
        windowWidth: containerRect.width,
        windowHeight: containerRect.height,
      });

      canvas.toBlob(
        (blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.download = `chat-${selectedPrompt?.name || "conversation"}-${
              new Date().toISOString().split("T")[0]
            }.png`;
            link.href = url;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
          } else {
            console.error("Failed to create blob from canvas.");
            alert("Failed to generate image. Please try again.");
          }
        },
        "image/png",
        0.95
      );
    } catch (error) {
      console.error("Failed to capture chat:", error);
      alert("Failed to capture chat. Please try again.");
    } finally {
      if (originalContainerStyleAttr === null) {
        chatContainer.removeAttribute("style");
      } else {
        chatContainer.setAttribute("style", originalContainerStyleAttr);
      }

      if (originalWindowStyleAttr === null) {
        chatWindow.removeAttribute("style");
      } else {
        chatWindow.setAttribute("style", originalWindowStyleAttr);
      }

      chatContainer.className = originalContainerClass;
      chatWindow.className = originalWindowClass;

      setIsSharing(false);
    }
  }, [messages.length, selectedPrompt?.name]);

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

  const isProcessing = isLoading || isEnhancing;

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      {/* New wrapper for chat container and share button */}
      <div className="flex flex-col items-center">
        {/* Main Chat Container - Boxy */}
        <div
          ref={chatContainerRef}
          className="bg-white border border-black w-full max-w-[500px] h-[700px] flex flex-col overflow-hidden shadow-lg"
        >
          {/* Header - Boxy */}
          <div className="bg-black text-white px-2 sm:px-4 py-2 sm:py-3 flex items-center shrink-0 relative">
            {/* Custom Dropdown - Boxy */}
            <div ref={dropdownRef} className="relative flex-shrink-0">
              <button
                type="button"
                onClick={() => !isProcessing && setIsDropdownOpen(!isDropdownOpen)}
                disabled={isProcessing}
                className="bg-white text-black border border-gray-300 px-1 sm:px-2 py-1 text-xs sm:text-sm focus:outline-none focus:ring-1 focus:ring-black cursor-pointer disabled:opacity-50 pr-6 sm:pr-8 relative text-left w-[120px] sm:w-[150px]"
              >
                <span className="truncate block">{selectedPrompt.name}</span>
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
                style={{ transformOrigin: "top" }}
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

            {/* Centered Title - Responsive with enhancement status */}
            <div className="flex-grow flex justify-center px-2">
              <h1 className="text-sm sm:text-lg font-medium text-center truncate">
                <span className="hidden sm:inline">
                  Sahil Gulihar's Chatbot
                </span>
                <span className="sm:hidden">SG's Chatbot</span>
                {isEnhancing && (
                  <span className="ml-2 text-xs text-yellow-300">
                    (Enhancing...)
                  </span>
                )}
              </h1>
            </div>

            {/* Action buttons - Responsive layout */}
            <div className="flex-shrink-0 flex items-center">
              {/* Reset button */}
              <button
                onClick={resetChat}
                disabled={isProcessing}
                className="px-2 sm:px-3 py-1 text-xs sm:text-sm bg-transparent border border-white text-white hover:bg-white hover:text-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Reset
              </button>
            </div>
          </div>

          {/* Chat Window - Boxy messages */}
          <div className="chat-window flex-grow p-4 overflow-y-auto flex flex-col gap-3 bg-white">
            {messages.map((message) => {
              const isUser = message.sender === "user";
              return (
                <div
                  key={message.id}
                  className={`max-w-[85%] p-3 border border-black text-sm leading-relaxed break-words ${
                    isUser
                      ? "self-end bg-black text-white"
                      : "self-start bg-white text-black"
                  }`}
                >
                  <div className="whitespace-pre-wrap prose prose-sm max-w-none text-inherit">
                    <Markdown remarkPlugins={[remarkGfm]}>
                      {message.text === "" &&
                      message.sender === "ai" &&
                      isProcessing
                        ? "..."
                        : message.text}
                    </Markdown>
                  </div>
                </div>
              );
            })}
            
            {/* Enhancement indicator */}
            {isEnhancing && (
              <div className="max-w-[85%] p-3 border border-blue-300 text-sm leading-relaxed break-words self-center text-center bg-blue-50 text-blue-700">
                <div className="flex items-center justify-center gap-2">
                  <svg
                    className="animate-spin h-4 w-4 text-blue-500"
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
                  <span>Enhancing system prompt for better response...</span>
                </div>
              </div>
            )}

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
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={
                isEnhancing 
                  ? "Enhancing system prompt..." 
                  : "Type your message..."
              }
              disabled={isProcessing}
              rows={2}
              className="flex-grow p-3 border border-black text-sm resize-none min-h-[60px] max-h-[120px] overflow-y-auto bg-white text-black placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-black disabled:opacity-50"
              style={{ fontFamily: "Arial, sans-serif" }}
            />
            <button
              onClick={handleSendMessage}
              disabled={isProcessing || input.trim() === ""}
              className="px-6 py-3 bg-gray-500 text-white border border-gray-500 text-sm font-medium hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0 flex items-center justify-center"
            >
              {isProcessing ? (
                <div className="flex items-center gap-2">
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
                  <span className="text-xs">
                    {isEnhancing ? "Enhancing" : "Sending"}
                  </span>
                </div>
              ) : (
                "Send"
              )}
            </button>
          </div>
        </div>

        {/* Enhanced Share Button with status indicator */}
        <button
          onClick={handleShare}
          disabled={isProcessing || isSharing || messages.length === 0}
          className="mt-3 py-1 px-2 text-xs text-gray-500 hover:text-gray-800 hover:underline focus:outline-none focus:ring-1 focus:ring-gray-400 rounded disabled:text-gray-400 disabled:opacity-70 disabled:cursor-not-allowed disabled:no-underline"
          title="Download chat as PNG"
        >
          {isSharing ? "Sharing..." : "Download Chat as Image (Beta)"}
        </button>
        
        {/* Enhancement info tooltip */}
        <div className="mt-2 text-xs text-gray-400 text-center max-w-[400px] px-2">
          <span className="inline-block w-2 h-2 bg-blue-400 rounded-full mr-1"></span>
          This chatbot uses AI-enhanced prompts that adapt to your messages for better responses
        </div>
      </div>
    </div>
  );
}