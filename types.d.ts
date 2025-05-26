export interface Message {
  id: string;
  sender: "user" | "ai";
  text: string;
  timestamp: Date;
}

export interface Prompt {
  id: string;
  name: string;
  text: string; // This is the system message text
  greeting: string;
}

export interface ChatbotState {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  selectedPrompt: Prompt;
}

export interface ChatbotActions {
  sendMessage: (message: string) => Promise<void>;
  changePrompt: (promptId: string) => void;
  clearError: () => void;
  resetChat: () => void;
}