import { ChangeEvent, FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Check,
  ChevronDown,
  Code2,
  Globe,
  GraduationCap,
  Image as ImageIcon,
  Lightbulb,
  LogOut,
  MessageSquare,
  PanelLeft,
  PenSquare,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Square,
  Trash2,
  X,
  PencilLine,
} from "lucide-react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";

type ChatRole = "user" | "assistant";
type ChatMode = "chat" | "code" | "translate" | "writing" | "research";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  imageDataUrl?: string;
};

type ConversationPayload = {
  id: string;
  title: string;
  messages: ChatMessage[];
  model: string;
  mode: ChatMode;
  updatedAt: string;
};

type ConversationSummary = {
  id: string;
  title: string;
  updatedAt: string;
};

type SessionPayload = {
  authenticated: boolean;
  username: string;
  models: string[];
  providers?: ProviderPayload[];
  activeProviderId?: string | null;
  activeModelByProvider?: Record<string, string>;
  selectedModel?: string;
  conversation?: ConversationPayload;
  conversations?: ConversationSummary[];
  activeConversationId?: string;
};

type ConversationApiResponse = {
  error?: string;
  conversation?: ConversationPayload;
  conversations?: ConversationSummary[];
  activeConversationId?: string;
  activeConversation?: ConversationPayload | null;
};

type ProviderPayload = {
  id: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
  models: string[];
  updatedAt: string;
  lastModelSyncAt?: string;
  hasApiKey: boolean;
  apiKeyMasked: string;
};

const suggestions = [
  { icon: Sparkles, label: "Surprise me", color: "text-amber-500" },
  { icon: ImageIcon, label: "Describe this UI", color: "text-emerald-500" },
  { icon: Lightbulb, label: "Brainstorm", color: "text-yellow-500" },
  { icon: Code2, label: "Write code", color: "text-sky-500" },
  { icon: GraduationCap, label: "Teach me", color: "text-rose-500" },
];

const toolModes: Array<{ id: ChatMode; label: string }> = [
  { id: "chat", label: "Chat" },
  { id: "code", label: "Code" },
  { id: "translate", label: "Translate" },
  { id: "writing", label: "Writing" },
  { id: "research", label: "Research" },
];

const fallbackChats = [
  "How to learn React Hooks",
  "Weekend trip planning ideas",
  "Write a product introduction",
  "Best practices for a design system",
  "Explain the Transformer architecture",
  "Python data visualization guide",
  "Dinner recommendations nearby",
];

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Unable to read image."));
    reader.readAsDataURL(file);
  });

const buildConversationTitle = (messages: ChatMessage[]) => {
  const firstUserMessage = messages.find((message) => message.role === "user");
  if (!firstUserMessage) {
    return "New chat";
  }

  if (firstUserMessage.content.trim()) {
    return firstUserMessage.content.trim().slice(0, 48);
  }

  if (firstUserMessage.imageDataUrl) {
    return "Image chat";
  }

  return "New chat";
};

async function parseJsonResponse<T>(response: Response, endpoint: string): Promise<T> {
  const raw = await response.text();
  const contentType = response.headers.get("content-type")?.toLowerCase() || "";

  if (!contentType.includes("application/json")) {
    throw new Error(
      `API ${endpoint} returned non-JSON (${response.status}). Check Cloudflare Pages Functions route for /api/*.`,
    );
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`API ${endpoint} returned invalid JSON (${response.status}).`);
  }
}

const Index = () => {
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [loadingSession, setLoadingSession] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [username, setUsername] = useState("demo");
  const [availableModels, setAvailableModels] = useState<string[]>(["gpt-4o-mini"]);
  const [availableProviders, setAvailableProviders] = useState<ProviderPayload[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [selectedModel, setSelectedModel] = useState("gpt-4o-mini");
  const [selectedMode, setSelectedMode] = useState<ChatMode>("chat");
  const [conversationId, setConversationId] = useState("");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [researchEnabled, setResearchEnabled] = useState(false);
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [imageName, setImageName] = useState("");
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showProviderMenu, setShowProviderMenu] = useState(false);
  const [showToolMenu, setShowToolMenu] = useState(false);
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [conversationActionBusy, setConversationActionBusy] = useState(false);
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  const location = useLocation();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const scrollAreaRef = useRef<HTMLElement | null>(null);
  const endOfMessagesRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);

  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false);
      return;
    }
    setSidebarOpen(true);
  }, [isMobile]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (!isMobile || !window.visualViewport) {
      setKeyboardOffset(0);
      return;
    }

    const viewport = window.visualViewport;
    const updateKeyboardOffset = () => {
      const offset = Math.max(
        0,
        window.innerHeight - viewport.height - viewport.offsetTop,
      );
      setKeyboardOffset(offset);
    };

    viewport.addEventListener("resize", updateKeyboardOffset);
    viewport.addEventListener("scroll", updateKeyboardOffset);
    updateKeyboardOffset();

    return () => {
      viewport.removeEventListener("resize", updateKeyboardOffset);
      viewport.removeEventListener("scroll", updateKeyboardOffset);
      setKeyboardOffset(0);
    };
  }, [isMobile]);

  useEffect(() => {
    if (!shouldAutoScrollRef.current) {
      return;
    }

    endOfMessagesRef.current?.scrollIntoView({
      block: "end",
      behavior: "auto",
    });
  }, [messages, isLoading]);

  useEffect(() => {
    const loadSession = async () => {
      try {
        const response = await fetch("/api/session");
        const data = await parseJsonResponse<SessionPayload>(response, "/api/session");
        const providers = data.providers || [];
        const activeProviderId =
          data.activeProviderId ||
          providers.find((provider) => provider.enabled)?.id ||
          "";
        const selectedProvider = providers.find((provider) => provider.id === activeProviderId);
        const fallbackModel =
          (activeProviderId &&
            data.activeModelByProvider?.[activeProviderId]) ||
          selectedProvider?.models?.[0] ||
          data.models?.[0] ||
          "gpt-4o-mini";

        setAvailableProviders(providers);
        setSelectedProviderId(activeProviderId);
        setAvailableModels(selectedProvider?.models || data.models || ["gpt-4o-mini"]);
        setSelectedModel(data.conversation?.model || data.selectedModel || fallbackModel);
        setSelectedMode(data.conversation?.mode || "chat");
        setUsername(data.username || "demo");
        setConversations(data.conversations || []);
        setConversationId(data.activeConversationId || data.conversation?.id || "");

        if (data.authenticated) {
          setAuthenticated(true);
          setMessages(data.conversation?.messages || []);
          if (data.conversation) {
            setConversations((current) =>
              current
                .filter((item) => item.id !== data.conversation?.id)
                .concat({
                  id: data.conversation.id,
                  title: data.conversation.title || buildConversationTitle(data.conversation.messages),
                  updatedAt: data.conversation.updatedAt,
                })
                .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
            );
          }
        }
      } catch {
        setError("Unable to load session.");
      } finally {
        setLoadingSession(false);
      }
    };

    void loadSession();
  }, [navigate]);

  const showConversation = messages.length > 0 || isLoading || error;

  const selectedProvider = availableProviders.find((provider) => provider.id === selectedProviderId);

  const persistProviderSelection = async (providerId: string, model?: string) => {
    const response = await fetch("/api/nangua/providers/select", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        providerId,
        ...(model ? { model } : {}),
      }),
    });
    if (!response.ok) {
      const data = await parseJsonResponse<{ error?: string }>(
        response,
        "/api/nangua/providers/select",
      );
      throw new Error(data.error || "Unable to switch provider.");
    }
  };

  const applyConversationPayload = (payload: ConversationApiResponse) => {
    if (payload.conversation) {
      setConversationId(payload.activeConversationId || payload.conversation.id);
      setMessages(payload.conversation.messages || []);
      setSelectedModel(payload.conversation.model || selectedModel);
      setSelectedMode(payload.conversation.mode || "chat");
    } else if (payload.activeConversation) {
      setConversationId(payload.activeConversationId || payload.activeConversation.id);
      setMessages(payload.activeConversation.messages || []);
      setSelectedModel(payload.activeConversation.model || selectedModel);
      setSelectedMode(payload.activeConversation.mode || "chat");
    }

    if (payload.conversations) {
      setConversations(payload.conversations);
    }
  };

  const clearImage = () => {
    setImageDataUrl("");
    setImageName("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleImageChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("Only image files are supported.");
      clearImage();
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setError("Image size must be under 2MB.");
      clearImage();
      return;
    }

    try {
      const dataUrl = await fileToDataUrl(file);
      setImageDataUrl(dataUrl);
      setImageName(file.name);
      setError("");
    } catch (imageError) {
      setError(imageError instanceof Error ? imageError.message : "Unable to load image.");
      clearImage();
    }
  };

  const streamReply = async (nextMessages: ChatMessage[]) => {
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsLoading(true);
    setError("");

    const assistantId = crypto.randomUUID();
    setMessages([...nextMessages, { id: assistantId, role: "assistant", content: "" }]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conversationId,
          messages: nextMessages,
          providerId: selectedProviderId,
          model: selectedModel,
          mode: selectedMode,
          researchEnabled,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const data = await parseJsonResponse<{ error?: string }>(response, "/api/chat");
        throw new Error(data.error || "Request failed.");
      }

      if (!response.body) {
        throw new Error("Streaming is not available.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalContent = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const event of events) {
          const line = event
            .split("\n")
            .find((entry) => entry.startsWith("data:"));

          if (!line) {
            continue;
          }

          const payload = JSON.parse(line.slice(5).trim()) as {
            type: "start" | "token" | "done" | "error";
            content?: string;
            error?: string;
          };

          if (payload.type === "token" && payload.content) {
            finalContent += payload.content;
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantId
                  ? { ...message, content: finalContent }
                  : message,
              ),
            );
          }

          if (payload.type === "error") {
            throw new Error(payload.error || "Streaming failed.");
          }
        }
      }

      if (!finalContent.trim()) {
        setMessages(nextMessages);
        throw new Error(
          "No response content received from upstream API. Check model/image support and streaming format.",
        );
      }
    } catch (requestError) {
      if (
        requestError instanceof DOMException &&
        requestError.name === "AbortError"
      ) {
        setMessages((current) => current.filter((message) => message.id !== assistantId || message.content));
      } else {
        setMessages(nextMessages);
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unknown error. Please try again.",
        );
      }
    } finally {
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  };

  const sendMessage = async () => {
    if ((!input.trim() && !imageDataUrl) || isLoading || !authenticated || !conversationId) {
      return;
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
      imageDataUrl: imageDataUrl || undefined,
    };

    const nextMessages = [...messagesRef.current, userMessage];
    shouldAutoScrollRef.current = true;
    setInput("");
    clearImage();
    setConversations((current) =>
      current
        .filter((item) => item.id !== conversationId)
        .concat({
          id: conversationId,
          title: buildConversationTitle(nextMessages),
          updatedAt: new Date().toISOString(),
        })
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    );
    await streamReply(nextMessages);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await sendMessage();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  };

  const handleLogout = async () => {
    abortControllerRef.current?.abort();
    await fetch("/api/logout", { method: "POST" });
    navigate("/login", { replace: true, state: { from: "/" } });
  };

  const handleResetConversation = async () => {
    abortControllerRef.current?.abort();
    if (authenticated) {
      const response = await fetch("/api/conversation/reset", { method: "POST" });
      const data = await parseJsonResponse<{ conversation?: ConversationPayload }>(
        response,
        "/api/conversation/reset",
      );
      setConversationId(data.conversation?.id || "");
      setMessages(data.conversation?.messages || []);
      if (data.conversation) {
        setConversations([
          {
            id: data.conversation.id,
            title: data.conversation.title,
            updatedAt: data.conversation.updatedAt,
          },
        ]);
      } else {
        setConversations([]);
      }
    }
    setError("");
    clearImage();
  };

  const handleStopStreaming = () => {
    abortControllerRef.current?.abort();
  };

  const handleRegenerate = async () => {
    if (isLoading) {
      return;
    }

    const currentMessages = [...messagesRef.current];
    if (currentMessages.length === 0) {
      return;
    }

    if (currentMessages[currentMessages.length - 1]?.role === "assistant") {
      currentMessages.pop();
    }

    if (currentMessages[currentMessages.length - 1]?.role !== "user") {
      return;
    }

    setMessages(currentMessages);
    shouldAutoScrollRef.current = true;
    await streamReply(currentMessages);
  };

  const handleCreateConversation = async () => {
    if (!authenticated || isLoading) {
      return;
    }

    const response = await fetch("/api/conversation/create", { method: "POST" });
    const data = await parseJsonResponse<{
      conversation?: ConversationPayload;
      conversations?: ConversationSummary[];
      activeConversationId?: string;
    }>(response, "/api/conversation/create");

    setConversationId(data.activeConversationId || data.conversation?.id || "");
    setMessages(data.conversation?.messages || []);
    setSelectedModel(data.conversation?.model || selectedModel);
    setSelectedMode(data.conversation?.mode || "chat");
    setConversations(data.conversations || []);
    setError("");
    clearImage();
    setInput("");
    shouldAutoScrollRef.current = true;
    if (isMobile) {
      setSidebarOpen(false);
    }
  };

  const handleSelectConversation = async (targetConversationId: string) => {
    if (!authenticated || isLoading || targetConversationId === conversationId) {
      return;
    }

    const response = await fetch("/api/conversation/select", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ conversationId: targetConversationId }),
    });
    const data = await parseJsonResponse<{
      error?: string;
      conversation?: ConversationPayload;
      conversations?: ConversationSummary[];
      activeConversationId?: string;
    }>(response, "/api/conversation/select");

    if (!response.ok) {
      setError(data.error || "Unable to switch conversation.");
      return;
    }

    setConversationId(data.activeConversationId || targetConversationId);
    setMessages(data.conversation?.messages || []);
    setSelectedModel(data.conversation?.model || selectedModel);
    setSelectedMode(data.conversation?.mode || "chat");
    setConversations(data.conversations || []);
    setError("");
    clearImage();
    shouldAutoScrollRef.current = true;
    if (isMobile) {
      setSidebarOpen(false);
    }
  };

  const handleRenameConversation = async (targetConversationId: string) => {
    const title = editingTitle.trim();
    if (!title || conversationActionBusy) {
      return;
    }

    setConversationActionBusy(true);
    try {
      const response = await fetch("/api/conversation/rename", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conversationId: targetConversationId,
          title,
        }),
      });
      const data = await parseJsonResponse<ConversationApiResponse>(
        response,
        "/api/conversation/rename",
      );
      if (!response.ok) {
        throw new Error(data.error || "Unable to rename conversation.");
      }

      applyConversationPayload(data);
      setEditingConversationId(null);
      setEditingTitle("");
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : "Unable to rename conversation.");
    } finally {
      setConversationActionBusy(false);
    }
  };

  const handleDeleteConversation = async (targetConversationId: string) => {
    if (conversationActionBusy || isLoading) {
      return;
    }

    setConversationActionBusy(true);
    try {
      const response = await fetch("/api/conversation/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conversationId: targetConversationId,
        }),
      });
      const data = await parseJsonResponse<ConversationApiResponse>(
        response,
        "/api/conversation/delete",
      );
      if (!response.ok) {
        throw new Error(data.error || "Unable to delete conversation.");
      }

      applyConversationPayload(data);
      setEditingConversationId(null);
      setEditingTitle("");
      clearImage();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete conversation.");
    } finally {
      setConversationActionBusy(false);
    }
  };

  const handleChatScroll = () => {
    const area = scrollAreaRef.current;
    if (!area) {
      return;
    }

    const distanceFromBottom =
      area.scrollHeight - area.scrollTop - area.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom < 96;
  };

  if (!loadingSession && !authenticated) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }

  return (
    <div className="relative flex h-[100svh] w-full overflow-hidden bg-background text-foreground">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleImageChange}
      />

      {isMobile && sidebarOpen && (
        <button
          aria-label="Close sidebar overlay"
          onClick={() => setSidebarOpen(false)}
          className="absolute inset-0 z-30 bg-black/40 backdrop-blur-[1px]"
        />
      )}

      <aside
        className={`${
          isMobile
            ? `absolute left-0 top-0 z-40 h-full w-72 transform border-r border-sidebar-border ${
                sidebarOpen ? "translate-x-0" : "-translate-x-full"
              }`
            : sidebarOpen
              ? "w-64 border-r border-sidebar-border"
              : "w-0 border-r-0"
        } shrink-0 overflow-hidden transition-all duration-300 bg-sidebar flex flex-col`}
      >
        <div className="flex items-center justify-between p-3">
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-2 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground"
            aria-label="Collapse sidebar"
          >
            <PanelLeft className="size-5" />
          </button>
          <button
            onClick={() => void handleCreateConversation()}
            className="p-2 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground"
            aria-label="New chat"
          >
            <PenSquare className="size-5" />
          </button>
        </div>

        <nav className="px-2 space-y-1 text-sm">
          <SidebarItem icon={MessageSquare} label="ChatGPT" />
          <SidebarItem icon={Sparkles} label="Sora" />
          <SidebarItem icon={SlidersHorizontal} label="GPTs" />
        </nav>

        <div className="px-4 mt-6 mb-2 text-xs font-medium text-muted-foreground">
          Recent chats
        </div>
        <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
          {(conversations.length > 0 ? conversations : []).map((chat) => (
            <div
              key={chat.id}
              className={`group flex items-center gap-1 rounded-lg px-2 py-1 ${
                conversationId === chat.id ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/70"
              }`}
            >
              {editingConversationId === chat.id ? (
                <>
                  <input
                    value={editingTitle}
                    onChange={(event) => setEditingTitle(event.target.value)}
                    className="flex-1 rounded-md border border-sidebar-border bg-background px-2 py-1 text-xs outline-none"
                    autoFocus
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void handleRenameConversation(chat.id);
                      }
                      if (event.key === "Escape") {
                        setEditingConversationId(null);
                        setEditingTitle("");
                      }
                    }}
                  />
                  <button
                    onClick={() => void handleRenameConversation(chat.id)}
                    className="p-1 rounded-md hover:bg-sidebar-accent"
                    aria-label="Save title"
                  >
                    <Check className="size-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      setEditingConversationId(null);
                      setEditingTitle("");
                    }}
                    className="p-1 rounded-md hover:bg-sidebar-accent"
                    aria-label="Cancel rename"
                  >
                    <X className="size-3.5" />
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => void handleSelectConversation(chat.id)}
                    className="flex-1 text-left px-1 py-1 rounded-md text-sm text-sidebar-foreground truncate"
                  >
                    {chat.title}
                  </button>
                  <button
                    onClick={() => {
                      setEditingConversationId(chat.id);
                      setEditingTitle(chat.title);
                    }}
                    className={`p-1 rounded-md text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-opacity ${
                      isMobile ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    }`}
                    aria-label="Rename conversation"
                  >
                    <PencilLine className="size-3.5" />
                  </button>
                  <button
                    onClick={() => void handleDeleteConversation(chat.id)}
                    className={`p-1 rounded-md text-sidebar-foreground/70 hover:text-red-600 hover:bg-sidebar-accent transition-opacity ${
                      isMobile ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    }`}
                    aria-label="Delete conversation"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </>
              )}
            </div>
          ))}
          {conversations.length === 0 &&
            fallbackChats.map((chat) => (
              <button
                key={chat}
                onClick={() => setInput(chat)}
                className="w-full text-left px-3 py-2 rounded-lg text-sm text-sidebar-foreground hover:bg-sidebar-accent truncate"
              >
                {chat}
              </button>
            ))}
        </div>

        <div className="p-2 border-t border-sidebar-border">
          <div className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm text-sidebar-foreground">
            <div className="flex items-center gap-3 min-w-0">
              <div className="size-7 rounded-full bg-gradient-to-br from-emerald-400 to-sky-500 flex items-center justify-center text-white text-xs font-semibold">
                {username.slice(0, 1).toUpperCase()}
              </div>
              <span className="truncate">{authenticated ? username : "Guest"}</span>
            </div>
            {authenticated && (
              <button
                onClick={() => void handleLogout()}
                className="p-1.5 rounded-md hover:bg-sidebar-accent"
                aria-label="Log out"
              >
                <LogOut className="size-4" />
              </button>
            )}
          </div>
        </div>
      </aside>

      <main className="flex-1 flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border/60 bg-background/95 px-2 py-2 backdrop-blur sm:px-3">
          <div className="flex items-center gap-2 relative">
            {(!sidebarOpen || isMobile) && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 rounded-lg hover:bg-accent"
                aria-label="Expand sidebar"
              >
                <PanelLeft className="size-5" />
              </button>
            )}
            <button
              onClick={() => setShowProviderMenu((open) => !open)}
              className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium hover:bg-accent sm:px-3 sm:text-sm"
            >
              {selectedProvider?.name || "Provider"}
              <ChevronDown className="size-4 text-muted-foreground" />
            </button>
            {showProviderMenu && (
              <div className="absolute top-full left-0 mt-2 max-h-72 w-52 overflow-y-auto rounded-2xl border border-border bg-background p-2 shadow-lg z-20">
                {availableProviders.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-muted-foreground">
                    No providers configured.
                  </div>
                ) : (
                  availableProviders.map((provider) => (
                    <button
                      key={provider.id}
                      onClick={() => {
                        const nextModel = provider.models[0] || "";
                        setSelectedProviderId(provider.id);
                        setAvailableModels(provider.models || []);
                        if (nextModel) {
                          setSelectedModel(nextModel);
                        }
                        setShowProviderMenu(false);
                        void persistProviderSelection(provider.id, nextModel).catch((selectionError) =>
                          setError(
                            selectionError instanceof Error
                              ? selectionError.message
                              : "Unable to switch provider.",
                          ),
                        );
                      }}
                      className={`w-full text-left px-3 py-2 rounded-xl text-sm hover:bg-accent ${
                        selectedProviderId === provider.id ? "bg-accent" : ""
                      }`}
                    >
                      {provider.name}
                    </button>
                  ))
                )}
              </div>
            )}
            <button
              onClick={() => setShowModelMenu((open) => !open)}
              className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-semibold hover:bg-accent sm:px-3 sm:text-base"
            >
              {selectedModel}
              <ChevronDown className="size-4 text-muted-foreground" />
            </button>
            {showModelMenu && (
              <div className="absolute top-full left-0 mt-2 max-h-72 w-56 overflow-y-auto rounded-2xl border border-border bg-background p-2 shadow-lg z-20">
                {availableModels.map((model) => (
                  <button
                    key={model}
                    onClick={() => {
                      setSelectedModel(model);
                      setShowModelMenu(false);
                      if (selectedProviderId) {
                        void persistProviderSelection(selectedProviderId, model).catch((selectionError) =>
                          setError(
                            selectionError instanceof Error
                              ? selectionError.message
                              : "Unable to switch model.",
                          ),
                        );
                      }
                    }}
                    className={`w-full text-left px-3 py-2 rounded-xl text-sm hover:bg-accent ${
                      selectedModel === model ? "bg-accent" : ""
                    }`}
                  >
                    {model}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="rounded-full h-9 hidden sm:inline-flex">
              <Sparkles className="size-4" /> {selectedMode}
            </Button>
            <button className="size-9 rounded-full bg-gradient-to-br from-emerald-400 to-sky-500 flex items-center justify-center text-white text-sm font-semibold">
              {username.slice(0, 1).toUpperCase()}
            </button>
          </div>
        </header>

        <section className="flex-1 overflow-hidden px-2 sm:px-4">
          <div className="mx-auto flex h-full w-full max-w-3xl flex-col">
            <div
              ref={scrollAreaRef}
              onScroll={handleChatScroll}
              className="flex-1 overflow-y-auto pb-3 pt-4 sm:py-8"
            >
              {loadingSession ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Loading session...
                </div>
              ) : !showConversation ? (
                <div className="flex min-h-full flex-col">
                  <h1 className="mb-8 text-center text-3xl font-semibold tracking-tight sm:text-4xl">
                    How can I help?
                  </h1>
                  <div className="mt-auto" />
                  {authenticated && (
                    <>
                      <div className="mt-5 flex flex-wrap justify-center gap-2 px-1">
                        {suggestions.map((suggestion) => (
                          <button
                            key={suggestion.label}
                            onClick={() => setInput(suggestion.label)}
                            className="flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm transition-colors hover:bg-accent"
                          >
                            <suggestion.icon className={`size-4 ${suggestion.color}`} />
                            <span>{suggestion.label}</span>
                          </button>
                        ))}
                        <button
                          onClick={() => void handleRegenerate()}
                          className="flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm transition-colors hover:bg-accent"
                        >
                          Retry last
                        </button>
                      </div>

                      <p className="mt-8 max-w-xl text-center text-xs text-muted-foreground">
                        This demo supports streaming replies, cloud-saved history, model switching, and image input.
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <div className="mb-4 space-y-4 sm:mb-6 sm:space-y-6">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[92%] rounded-3xl px-4 py-3 text-sm leading-7 shadow-sm sm:max-w-[85%] sm:px-5 sm:py-4 ${
                          message.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary text-secondary-foreground"
                        }`}
                      >
                        {message.imageDataUrl && (
                          <img
                            src={message.imageDataUrl}
                            alt="Uploaded"
                            className="mb-3 max-h-64 rounded-2xl border border-white/10 object-cover"
                          />
                        )}
                        {message.content ? (
                          <MessageMarkdown content={message.content} />
                        ) : message.role === "assistant" && isLoading ? (
                          <ThinkingIndicator />
                        ) : message.role === "user" && message.imageDataUrl ? (
                          "Image attached"
                        ) : (
                          ""
                        )}
                      </div>
                    </div>
                  ))}

                  {error && (
                    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {error}
                    </div>
                  )}

                  {authenticated && showConversation && !isLoading && (
                    <div className="mt-5 flex justify-center">
                      <button
                        onClick={() => void handleRegenerate()}
                        className="rounded-full border border-border bg-background px-4 py-2 text-sm transition-colors hover:bg-accent"
                      >
                        Regenerate response
                      </button>
                    </div>
                  )}

                  <div ref={endOfMessagesRef} />
                </div>
              )}
            </div>

            {authenticated && (
              <form
                onSubmit={handleSubmit}
                style={{
                  paddingBottom: `calc(max(env(safe-area-inset-bottom), 8px) + ${keyboardOffset}px)`,
                }}
                className="z-10 border-t border-border/40 bg-background/95 py-2 backdrop-blur"
              >
                {imageDataUrl && (
                  <div className="mb-3 rounded-3xl border border-border bg-card p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <img
                          src={imageDataUrl}
                          alt="Preview"
                          className="size-16 rounded-2xl object-cover"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{imageName}</p>
                          <p className="text-xs text-muted-foreground">
                            Sent to the vision-capable model with your next message.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={clearImage}
                        className="rounded-lg p-2 hover:bg-accent"
                        aria-label="Remove image"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  </div>
                )}

                {showToolMenu && (
                  <div className="mb-3 rounded-3xl border border-border bg-card p-3">
                    <div className="flex flex-wrap gap-2">
                      {toolModes.map((mode) => (
                        <button
                          key={mode.id}
                          type="button"
                          onClick={() => {
                            setSelectedMode(mode.id);
                            setShowToolMenu(false);
                          }}
                          className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                            selectedMode === mode.id
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background hover:bg-accent"
                          }`}
                        >
                          {mode.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="rounded-3xl border border-border bg-[hsl(var(--chat-input))] shadow-sm transition-shadow hover:shadow-md">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask anything"
                    rows={isMobile ? 2 : 1}
                    className="w-full resize-none bg-transparent px-4 pb-2 pt-3 text-base outline-none placeholder:text-muted-foreground sm:px-5 sm:pt-4"
                  />
                  <div className="flex items-center justify-between px-2 pb-2 sm:px-3 sm:pb-3">
                    <div className="relative flex items-center gap-1">
                      <ComposerIcon
                        icon={Plus}
                        label="Image"
                        active={Boolean(imageDataUrl)}
                        onClick={() => fileInputRef.current?.click()}
                      />
                      <ComposerIcon
                        icon={SlidersHorizontal}
                        label="Tools"
                        active={showToolMenu || selectedMode !== "chat"}
                        onClick={() => setShowToolMenu((open) => !open)}
                      />
                      <ComposerIcon
                        icon={Globe}
                        label="Research mode"
                        active={researchEnabled}
                        onClick={() => setResearchEnabled((current) => !current)}
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      {isLoading ? (
                        <button
                          type="button"
                          onClick={handleStopStreaming}
                          className="flex size-9 items-center justify-center rounded-full bg-secondary text-secondary-foreground hover:opacity-90"
                          aria-label="Stop"
                        >
                          <Square className="size-4" />
                        </button>
                      ) : (
                        <button
                          type="submit"
                          className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-30"
                          disabled={(!input.trim() && !imageDataUrl) || isLoading}
                          aria-label="Send"
                        >
                          <ArrowUp className="size-5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </form>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};

const SidebarItem = ({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) => (
  <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground">
    <Icon className="size-4" />
    <span>{label}</span>
  </button>
);

const ComposerIcon = ({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) => (
  <button
    type="button"
    aria-label={label}
    onClick={onClick}
    className={`size-9 rounded-full flex items-center justify-center hover:bg-accent hover:text-foreground ${
      active
        ? "bg-accent text-foreground"
        : "text-muted-foreground"
    }`}
  >
    <Icon className="size-5" />
  </button>
);

const MessageMarkdown = ({ content }: { content: string }) => (
  <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    className="prose prose-sm max-w-none break-words prose-headings:text-inherit prose-p:text-inherit prose-a:text-inherit prose-strong:text-inherit prose-code:text-inherit prose-pre:text-inherit prose-pre:bg-black/20 prose-ul:text-inherit prose-ol:text-inherit prose-li:text-inherit prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-pre:my-2 prose-code:before:content-none prose-code:after:content-none"
  >
    {content}
  </ReactMarkdown>
);

const ThinkingIndicator = () => (
  <div className="inline-flex items-center gap-2 text-muted-foreground">
    <span className="text-xs font-medium tracking-[0.16em] uppercase bg-gradient-to-r from-sky-300 via-emerald-300 to-cyan-300 bg-clip-text text-transparent animate-pulse">
      Thinking
    </span>
    <span className="inline-flex items-center gap-1">
      <span className="size-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.2s]" />
      <span className="size-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.1s]" />
      <span className="size-1.5 rounded-full bg-current animate-bounce" />
    </span>
  </div>
);

export default Index;
