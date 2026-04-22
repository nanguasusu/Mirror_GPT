export interface KVNamespaceLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface Env {
  AI_API_KEY?: string;
  AI_BASE_URL?: string;
  AI_MODEL?: string;
  AI_MODELS?: string;
  AI_SYSTEM_PROMPT?: string;
  DEMO_USERNAME?: string;
  DEMO_PASSWORD?: string;
  SESSION_SECRET?: string;
  CHAT_KV?: KVNamespaceLike;
}

export type ChatRole = "user" | "assistant";
export type ChatMode = "chat" | "code" | "translate" | "writing" | "research";

export type StoredMessage = {
  id: string;
  role: ChatRole;
  content: string;
  imageDataUrl?: string;
};

export type StoredConversation = {
  id: string;
  title: string;
  messages: StoredMessage[];
  model: string;
  mode: ChatMode;
  updatedAt: string;
};

export type StoredConversationSummary = {
  id: string;
  title: string;
  updatedAt: string;
};

export type StoredConversationIndex = {
  activeConversationId: string | null;
  conversations: StoredConversationSummary[];
};

const COOKIE_NAME = "demo_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;
const DEFAULT_MODELS = ["gpt-4o-mini", "gpt-4.1-mini", "gpt-4.1"];

const encoder = new TextEncoder();

export const defaultModel = "gpt-4o-mini";
export const defaultMode: ChatMode = "chat";
export const defaultSystemPrompt =
  "You are a concise and helpful AI assistant for a personal demo site.";

export const json = (
  body: Record<string, unknown>,
  status = 200,
  extraHeaders?: Record<string, string>,
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });

export const getAllowedModels = (env: Env) =>
  (env.AI_MODELS || "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean)
    .concat(DEFAULT_MODELS)
    .filter((value, index, array) => array.indexOf(value) === index);

export const getDefaultUsername = (env: Env) => env.DEMO_USERNAME || "demo";
export const getDefaultPassword = (env: Env) => env.DEMO_PASSWORD || "demo123456";
export const getSessionSecret = (env: Env) => env.SESSION_SECRET || "change-me-before-production";

export const getConversationKey = (username: string) => `conversation:${username}`;
export const getConversationItemKey = (username: string, conversationId: string) =>
  `conversation:${username}:${conversationId}`;
export const getConversationIndexKey = (username: string) => `conversation-index:${username}`;

export const createConversationTitle = (messages: StoredMessage[]) => {
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

const createEmptyConversation = (env: Env, id?: string) =>
  ({
    id: id || crypto.randomUUID(),
    title: "New chat",
    messages: [],
    model: env.AI_MODEL || defaultModel,
    mode: defaultMode,
    updatedAt: new Date().toISOString(),
  }) satisfies StoredConversation;

export const readConversationIndex = async (
  env: Env,
  username: string,
) => {
  const raw = await env.CHAT_KV?.get(getConversationIndexKey(username));
  if (!raw) {
    return {
      activeConversationId: null,
      conversations: [],
    } satisfies StoredConversationIndex;
  }

  try {
    const parsed = JSON.parse(raw) as StoredConversationIndex;
    return {
      activeConversationId: parsed.activeConversationId || null,
      conversations: Array.isArray(parsed.conversations) ? parsed.conversations : [],
    } satisfies StoredConversationIndex;
  } catch {
    return {
      activeConversationId: null,
      conversations: [],
    } satisfies StoredConversationIndex;
  }
};

export const writeConversationIndex = async (
  env: Env,
  username: string,
  index: StoredConversationIndex,
) => {
  if (!env.CHAT_KV) {
    return;
  }

  await env.CHAT_KV.put(getConversationIndexKey(username), JSON.stringify(index));
};

export const readConversation = async (env: Env, username: string) => {
  const index = await readConversationIndex(env, username);
  if (!index.activeConversationId) {
    return createEmptyConversation(env);
  }

  return readConversationById(env, username, index.activeConversationId);
};

export const readConversationById = async (
  env: Env,
  username: string,
  conversationId: string,
) => {
  const raw = await env.CHAT_KV?.get(getConversationItemKey(username, conversationId));
  if (!raw) {
    return createEmptyConversation(env, conversationId);
  }

  try {
    const parsed = JSON.parse(raw) as StoredConversation;
    return {
      id: parsed.id || conversationId,
      title: parsed.title || "New chat",
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      model: parsed.model || env.AI_MODEL || defaultModel,
      mode: parsed.mode || defaultMode,
      updatedAt: parsed.updatedAt || new Date().toISOString(),
    } satisfies StoredConversation;
  } catch {
    return createEmptyConversation(env, conversationId);
  }
};

export const writeConversation = async (
  env: Env,
  username: string,
  conversation: StoredConversation,
  options?: {
    setActiveConversation?: boolean;
  },
) => {
  if (!env.CHAT_KV) {
    return;
  }

  const normalizedConversation = {
    ...conversation,
    title: conversation.title || createConversationTitle(conversation.messages),
  };

  await env.CHAT_KV.put(
    getConversationItemKey(username, normalizedConversation.id),
    JSON.stringify(normalizedConversation),
  );

  const index = await readConversationIndex(env, username);
  const summary: StoredConversationSummary = {
    id: normalizedConversation.id,
    title: normalizedConversation.title,
    updatedAt: normalizedConversation.updatedAt,
  };
  const nextConversations = index.conversations
    .filter((item) => item.id !== normalizedConversation.id)
    .concat(summary)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  await writeConversationIndex(env, username, {
    activeConversationId:
      options?.setActiveConversation === false
        ? index.activeConversationId
        : normalizedConversation.id,
    conversations: nextConversations,
  });
};

export const clearConversation = async (env: Env, username: string) => {
  const index = await readConversationIndex(env, username);
  if (!env.CHAT_KV) {
    return;
  }

  for (const conversation of index.conversations) {
    await env.CHAT_KV.delete(getConversationItemKey(username, conversation.id));
  }
  await env.CHAT_KV.delete(getConversationIndexKey(username));
};

export const setActiveConversation = async (
  env: Env,
  username: string,
  conversationId: string | null,
) => {
  const index = await readConversationIndex(env, username);
  await writeConversationIndex(env, username, {
    ...index,
    activeConversationId: conversationId,
  });
};

export const createConversation = async (env: Env, username: string) => {
  const conversation = createEmptyConversation(env);
  await writeConversation(env, username, conversation);
  return conversation;
};

export const renameConversationById = async (
  env: Env,
  username: string,
  conversationId: string,
  title: string,
) => {
  const index = await readConversationIndex(env, username);
  if (!index.conversations.some((item) => item.id === conversationId)) {
    return null;
  }

  const conversation = await readConversationById(env, username, conversationId);
  const normalizedTitle = title.trim().slice(0, 80);
  const nextConversation: StoredConversation = {
    ...conversation,
    title: normalizedTitle || conversation.title,
    updatedAt: new Date().toISOString(),
  };

  await writeConversation(env, username, nextConversation, {
    setActiveConversation: false,
  });
  return nextConversation;
};

export const deleteConversationById = async (
  env: Env,
  username: string,
  conversationId: string,
) => {
  const index = await readConversationIndex(env, username);
  const exists = index.conversations.some((item) => item.id === conversationId);
  if (!exists) {
    return null;
  }

  if (env.CHAT_KV) {
    await env.CHAT_KV.delete(getConversationItemKey(username, conversationId));
  }

  const nextConversations = index.conversations.filter((item) => item.id !== conversationId);
  const nextActive =
    index.activeConversationId === conversationId
      ? (nextConversations[0]?.id ?? null)
      : index.activeConversationId;

  await writeConversationIndex(env, username, {
    activeConversationId: nextActive,
    conversations: nextConversations,
  });

  return {
    activeConversationId: nextActive,
    conversations: nextConversations,
  };
};

export const readJson = async <T>(request: Request) => {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
};

const toHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

const sign = async (value: string, secret: string) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(`${value}.${secret}`),
  );
  return toHex(digest);
};

const parseCookies = (request: Request) =>
  Object.fromEntries(
    (request.headers.get("Cookie") || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf("=");
        const key = separator >= 0 ? part.slice(0, separator) : part;
        const value = separator >= 0 ? part.slice(separator + 1) : "";
        return [key, decodeURIComponent(value)];
      }),
  );

export const createSessionCookie = async (
  username: string,
  env: Env,
  request: Request,
) => {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;
  const payload = `${username}.${expiresAt}`;
  const signature = await sign(payload, getSessionSecret(env));
  const value = encodeURIComponent(`${payload}.${signature}`);
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}${secure}`;
};

export const clearSessionCookie = (request: Request) => {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
};

export const getAuthenticatedUser = async (request: Request, env: Env) => {
  const cookieValue = parseCookies(request)[COOKIE_NAME];
  if (!cookieValue) {
    return null;
  }

  const parts = cookieValue.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [username, expiresAtRaw, signature] = parts;
  const expiresAt = Number(expiresAtRaw);
  if (!username || !expiresAt || Date.now() / 1000 > expiresAt) {
    return null;
  }

  const expected = await sign(`${username}.${expiresAt}`, getSessionSecret(env));
  if (signature !== expected) {
    return null;
  }

  return username;
};

export const getModeInstruction = (mode: ChatMode, researchEnabled: boolean) => {
  const modePrompts: Record<ChatMode, string> = {
    chat: "Respond naturally and clearly.",
    code: "Prioritize accurate code, concise explanations, and implementation details.",
    translate: "Act as a translator and language editor unless the user asks otherwise.",
    writing: "Prioritize tone, structure, and polished writing.",
    research:
      "Provide a structured research-style answer. Be explicit when you do not have live web access.",
  };

  return `${modePrompts[mode]} ${
    researchEnabled
      ? "The user enabled research mode. Give a structured answer and clearly state that live web access is unavailable in this demo unless sources were provided."
      : ""
  }`.trim();
};
