export interface KVNamespaceLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface Env {
  AI_API_KEY?: string;
  AI_BASE_URL?: string;
  AI_MODELS?: string;
  AI_SYSTEM_PROMPT?: string;
  DEMO_USERNAME?: string;
  DEMO_PASSWORD?: string;
  SESSION_SECRET?: string;
  CHAT_KV?: KVNamespaceLike;
}

export type ChatRole = "user" | "assistant";
export type ChatMode = "chat" | "code" | "translate" | "writing" | "research";
export type ProviderEndpointType = "models" | "chat" | "embeddings";

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

export type StoredProvider = {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
  models: string[];
  updatedAt: string;
  lastModelSyncAt?: string;
};

export type StoredProviderState = {
  activeProviderId: string | null;
  activeModelByProvider: Record<string, string>;
  providers: StoredProvider[];
};

const COOKIE_NAME = "demo_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;
const DEFAULT_MODELS = ["gpt-4o-mini", "gpt-4.1-mini", "gpt-4.1"];

const encoder = new TextEncoder();
const ENV_PROVIDER_ID = "env-default";

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

export const ensureChatKv = (env: Env) => {
  if (env.CHAT_KV) {
    return null;
  }

  return json(
    {
      error:
        "Missing CHAT_KV binding. Add KV binding named CHAT_KV in Cloudflare Pages project settings.",
    },
    500,
  );
};

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
export const getProviderStateKey = (username: string) => `provider-state:${username}`;

export const normalizeProviderBaseUrl = (rawBaseUrl: string) => {
  const trimmed = rawBaseUrl.trim();
  if (!trimmed) {
    throw new Error("baseUrl is required.");
  }

  let normalized = trimmed
    .replace(/\/chat\/completions\/?$/i, "")
    .replace(/\/models\/?$/i, "")
    .replace(/\/embeddings\/?$/i, "")
    .replace(/\/+$/, "");

  if (!/^https?:\/\//i.test(normalized)) {
    normalized = `https://${normalized}`;
  }

  const parsed = new URL(normalized);
  const pathname = parsed.pathname.replace(/\/+$/, "");
  parsed.pathname = pathname.endsWith("/v1")
    ? pathname || "/v1"
    : `${pathname || ""}/v1`;

  return parsed.toString().replace(/\/+$/, "");
};

export const buildProviderEndpoint = (
  baseUrl: string,
  endpoint: ProviderEndpointType,
) => `${baseUrl}/${endpoint === "chat" ? "chat/completions" : endpoint}`;

const createEnvProvider = (env: Env): StoredProvider | null => {
  if (!env.AI_BASE_URL || !env.AI_API_KEY) {
    return null;
  }

  let baseUrl = "";
  try {
    baseUrl = normalizeProviderBaseUrl(env.AI_BASE_URL);
  } catch {
    return null;
  }

  const models = getAllowedModels(env);
  return {
    id: ENV_PROVIDER_ID,
    name: "Default Provider",
    baseUrl,
    apiKey: env.AI_API_KEY,
    enabled: true,
    models,
    updatedAt: new Date().toISOString(),
    lastModelSyncAt: undefined,
  };
};

export const sanitizeProvider = (provider: StoredProvider) => ({
  id: provider.id,
  name: provider.name,
  baseUrl: provider.baseUrl,
  enabled: provider.enabled,
  models: provider.models,
  updatedAt: provider.updatedAt,
  lastModelSyncAt: provider.lastModelSyncAt,
  hasApiKey: Boolean(provider.apiKey),
  apiKeyMasked: provider.apiKey
    ? `${provider.apiKey.slice(0, 4)}...${provider.apiKey.slice(-4)}`
    : "",
});

const getEmptyProviderState = (): StoredProviderState => ({
  activeProviderId: null,
  activeModelByProvider: {},
  providers: [],
});

export const readProviderState = async (env: Env, username: string) => {
  const raw = await env.CHAT_KV?.get(getProviderStateKey(username));
  let state: StoredProviderState = getEmptyProviderState();

  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<StoredProviderState>;
      state = {
        activeProviderId:
          typeof parsed.activeProviderId === "string" ? parsed.activeProviderId : null,
        activeModelByProvider:
          parsed.activeModelByProvider && typeof parsed.activeModelByProvider === "object"
            ? (parsed.activeModelByProvider as Record<string, string>)
            : {},
        providers: Array.isArray(parsed.providers)
          ? parsed.providers
              .filter((item) => item && typeof item === "object")
              .map((item) => {
                const provider = item as Partial<StoredProvider>;
                return {
                  id: provider.id || crypto.randomUUID(),
                  name: provider.name?.trim() || "Provider",
                  baseUrl: provider.baseUrl || "",
                  apiKey: provider.apiKey || "",
                  enabled: provider.enabled !== false,
                  models: Array.isArray(provider.models)
                    ? provider.models.filter((model) => typeof model === "string")
                    : [],
                  updatedAt: provider.updatedAt || new Date().toISOString(),
                  lastModelSyncAt: provider.lastModelSyncAt,
                } satisfies StoredProvider;
              })
          : [],
      };
    } catch {
      state = getEmptyProviderState();
    }
  }

  const envProvider = createEnvProvider(env);
  if (state.providers.length === 0 && envProvider) {
    return {
      activeProviderId: envProvider.id,
      activeModelByProvider: {
        [envProvider.id]: envProvider.models[0] || defaultModel,
      },
      providers: [envProvider],
    } satisfies StoredProviderState;
  }

  return state;
};

export const writeProviderState = async (
  env: Env,
  username: string,
  state: StoredProviderState,
) => {
  if (!env.CHAT_KV) {
    return;
  }

  await env.CHAT_KV.put(getProviderStateKey(username), JSON.stringify(state));
};

export const resolveActiveProvider = (
  state: StoredProviderState,
  preferredProviderId?: string,
) => {
  const enabledProviders = state.providers.filter((provider) => provider.enabled);
  if (enabledProviders.length === 0) {
    return null;
  }

  if (preferredProviderId) {
    const preferred = enabledProviders.find((provider) => provider.id === preferredProviderId);
    if (preferred) {
      return preferred;
    }
  }

  if (state.activeProviderId) {
    const active = enabledProviders.find((provider) => provider.id === state.activeProviderId);
    if (active) {
      return active;
    }
  }

  return enabledProviders[0];
};

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
    model: defaultModel,
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
  options?: {
    fallbackModel?: string;
  },
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
      model: parsed.model || options?.fallbackModel || defaultModel,
      mode: parsed.mode || defaultMode,
      updatedAt: parsed.updatedAt || new Date().toISOString(),
    } satisfies StoredConversation;
  } catch {
    return {
      ...createEmptyConversation(env, conversationId),
      model: options?.fallbackModel || defaultModel,
    };
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

export const resolvePreferredModelForUser = async (
  env: Env,
  username: string,
  preferredProviderId?: string,
) => {
  const providerState = await readProviderState(env, username);
  const activeProvider = resolveActiveProvider(providerState, preferredProviderId);
  if (!activeProvider) {
    return defaultModel;
  }

  return (
    providerState.activeModelByProvider[activeProvider.id] ||
    activeProvider.models[0] ||
    defaultModel
  );
};

export const createConversation = async (
  env: Env,
  username: string,
  options?: {
    preferredModel?: string;
  },
) => {
  const conversation = {
    ...createEmptyConversation(env),
    model: options?.preferredModel || defaultModel,
  };
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
