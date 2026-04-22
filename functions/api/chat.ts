import {
  defaultModel,
  defaultMode,
  defaultSystemPrompt,
  getAllowedModels,
  getAuthenticatedUser,
  getModeInstruction,
  json,
  readConversationIndex,
  readJson,
  setActiveConversation,
  writeConversation,
  type ChatMode,
  type Env,
  type StoredConversation,
  type StoredMessage,
} from "./_shared";

type IncomingMessage = {
  id?: string;
  role?: "user" | "assistant";
  content?: string;
  imageDataUrl?: string;
};

type ChatBody = {
  conversationId?: string;
  messages?: IncomingMessage[];
  model?: string;
  mode?: ChatMode;
  researchEnabled?: boolean;
};

type UpstreamChunk = {
  choices?: Array<{
    delta?: {
      content?: string;
    };
  }>;
};

type NonStreamCompletion = {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
};

const defaultBaseUrl = "https://api.openai.com/v1/chat/completions";

const encoder = new TextEncoder();

const toSse = (payload: Record<string, unknown>) =>
  encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);

const normalizeMessages = (messages: IncomingMessage[]) =>
  messages
    .filter(
      (message) =>
        (message.role === "user" || message.role === "assistant") &&
        ((message.content && message.content.trim()) || message.imageDataUrl),
    )
    .map(
      (message) =>
        ({
          id: message.id || crypto.randomUUID(),
          role: message.role as "user" | "assistant",
          content: message.content?.trim() || "",
          imageDataUrl: message.imageDataUrl,
        }) satisfies StoredMessage,
    );

const buildUpstreamMessages = (
  messages: StoredMessage[],
  systemPrompt: string,
) => [
  {
    role: "system",
    content: systemPrompt,
  },
  ...messages.map((message) => {
    if (message.role === "user" && message.imageDataUrl) {
      return {
        role: "user",
        content: [
          ...(message.content
            ? [{ type: "text", text: message.content }]
            : []),
          {
            type: "image_url",
            image_url: {
              url: message.imageDataUrl,
            },
          },
        ],
      };
    }

    return {
      role: message.role,
      content: message.content,
    };
  }),
];

const buildUpstreamRequestBody = (
  model: string,
  messages: StoredMessage[],
  systemPrompt: string,
  stream: boolean,
) => ({
  model,
  temperature: 0.7,
  stream,
  messages: buildUpstreamMessages(messages, systemPrompt),
});

const extractTextContent = (content: unknown): string => {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (!item || typeof item !== "object") {
          return "";
        }

        const maybeText = (item as { text?: unknown }).text;
        return typeof maybeText === "string" ? maybeText : "";
      })
      .join("");
  }

  return "";
};

const clipText = (value: string, max = 120) => value.replace(/\s+/g, " ").trim().slice(0, max);

const parseJsonIfPossible = async <T>(response: Response): Promise<T | null> => {
  const contentType = response.headers.get("content-type")?.toLowerCase() || "";
  if (!contentType.includes("application/json")) {
    return null;
  }

  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
};

const parseUpstreamError = async (response: Response) => {
  const contentType = response.headers.get("content-type")?.toLowerCase() || "";
  const status = response.status || 500;

  if (contentType.includes("application/json")) {
    try {
      const data = (await response.json()) as {
        error?: {
          message?: string;
        };
      };
      if (data.error?.message) {
        return data.error.message;
      }
    } catch {
      return `Model request failed (${status}): invalid JSON error body from upstream.`;
    }
  }

  try {
    const raw = await response.text();
    if (raw) {
      return `Model request failed (${status}). Upstream returned non-JSON: ${clipText(raw)}`;
    }
    return `Model request failed (${status}).`;
  } catch {
    return `Model request failed (${status}).`;
  }
};

export const onRequestOptions = async () =>
  new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "no-store",
    },
  });

export const onRequestPost = async ({
  env,
  request,
}: {
  env: Env;
  request: Request;
}) => {
  const username = await getAuthenticatedUser(request, env);
  if (!username) {
    return json({ error: "Unauthorized." }, 401);
  }

  if (!env.AI_API_KEY) {
    return json(
      { error: "Missing AI_API_KEY. Set it in Cloudflare Pages environment variables." },
      500,
    );
  }

  const body = await readJson<ChatBody>(request);
  if (!body) {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const normalizedMessages = normalizeMessages(body.messages || []);
  if (normalizedMessages.length === 0) {
    return json({ error: "At least one message is required." }, 400);
  }

  const conversationId = body.conversationId?.trim();
  if (!conversationId) {
    return json({ error: "conversationId is required." }, 400);
  }

  const conversationIndex = await readConversationIndex(env, username);
  if (!conversationIndex.conversations.some((item) => item.id === conversationId)) {
    // Repair inconsistent index/session state by recreating the requested conversation id.
    await writeConversation(env, username, {
      id: conversationId,
      title: "",
      messages: [],
      model: env.AI_MODEL || defaultModel,
      mode: defaultMode,
      updatedAt: new Date().toISOString(),
    });
  }

  const allowedModels = getAllowedModels(env);
  const selectedModel = allowedModels.includes(body.model || "")
    ? (body.model as string)
    : env.AI_MODEL || defaultModel;
  const selectedMode = body.mode || defaultMode;

  const systemPrompt = [
    env.AI_SYSTEM_PROMPT || defaultSystemPrompt,
    getModeInstruction(selectedMode, Boolean(body.researchEnabled)),
  ]
    .filter(Boolean)
    .join("\n\n");

  await writeConversation(env, username, {
    id: conversationId,
    title: "",
    messages: normalizedMessages,
    model: selectedModel,
    mode: selectedMode,
    updatedAt: new Date().toISOString(),
  });
  await setActiveConversation(env, username, conversationId);

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(env.AI_BASE_URL || defaultBaseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.AI_API_KEY}`,
      },
      body: JSON.stringify(
        buildUpstreamRequestBody(selectedModel, normalizedMessages, systemPrompt, true),
      ),
    });
  } catch (networkError) {
    return json(
      {
        error:
          networkError instanceof Error
            ? `Upstream request failed before response: ${networkError.message}`
            : "Upstream request failed before response.",
      },
      502,
    );
  }

  if (!upstreamResponse.ok || !upstreamResponse.body) {
    return json(
      {
        error:
          (await parseUpstreamError(upstreamResponse)) ||
          "Model request failed. Check AI_BASE_URL, AI_MODEL, and AI_API_KEY.",
      },
      upstreamResponse.status || 500,
    );
  }

  const streamContentType = upstreamResponse.headers.get("content-type")?.toLowerCase() || "";
  if (!streamContentType.includes("text/event-stream")) {
    const raw = await upstreamResponse.text();
    return json(
      {
        error: `Upstream stream response is not SSE (${upstreamResponse.status}). Content-Type: ${
          streamContentType || "unknown"
        }. Body: ${clipText(raw)}`,
      },
      502,
    );
  }

  const upstreamReader = upstreamResponse.body.getReader();
  const decoder = new TextDecoder();
  let fullReply = "";
  let buffer = "";

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(
        toSse({
          type: "start",
          model: selectedModel,
          mode: selectedMode,
        }),
      );

      try {
        while (true) {
          const { done, value } = await upstreamReader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line.startsWith("data:")) {
              continue;
            }

            const data = line.slice(5).trim();
            if (!data || data === "[DONE]") {
              continue;
            }

            try {
              const parsed = JSON.parse(data) as UpstreamChunk;
              const delta = parsed.choices?.[0]?.delta?.content;
              if (!delta) {
                continue;
              }

              fullReply += delta;
              controller.enqueue(
                toSse({
                  type: "token",
                  content: delta,
                }),
              );
            } catch {
              continue;
            }
          }

          if (request.signal.aborted) {
            break;
          }
        }

        if (!fullReply.trim() && !request.signal.aborted) {
          const fallbackResponse = await fetch(env.AI_BASE_URL || defaultBaseUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${env.AI_API_KEY}`,
            },
            body: JSON.stringify(
              buildUpstreamRequestBody(
                selectedModel,
                normalizedMessages,
                systemPrompt,
                false,
              ),
            ),
          });

          if (!fallbackResponse.ok) {
            throw new Error(await parseUpstreamError(fallbackResponse));
          }

          const fallbackData = await parseJsonIfPossible<NonStreamCompletion>(fallbackResponse);
          if (!fallbackData) {
            const raw = await fallbackResponse.text();
            throw new Error(
              `Fallback response is not JSON (${fallbackResponse.status}). Content-Type: ${
                fallbackResponse.headers.get("content-type") || "unknown"
              }. Body: ${clipText(raw)}`,
            );
          }

          const fallbackContent = extractTextContent(
            fallbackData.choices?.[0]?.message?.content,
          ).trim();

          if (fallbackContent) {
            fullReply = fallbackContent;
            controller.enqueue(
              toSse({
                type: "token",
                content: fallbackContent,
              }),
            );
          }
        }

        const assistantMessage: StoredMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: fullReply.trim(),
        };

        const conversationMessages = assistantMessage.content
          ? [...normalizedMessages, assistantMessage]
          : normalizedMessages;

        const conversation: StoredConversation = {
          id: conversationId,
          title: "",
          messages: conversationMessages,
          model: selectedModel,
          mode: selectedMode,
          updatedAt: new Date().toISOString(),
        };

        await writeConversation(env, username, conversation);
        await setActiveConversation(env, username, conversationId);

        controller.enqueue(
          toSse({
            type: "done",
            message: assistantMessage.content,
          }),
        );
        controller.close();
      } catch (error) {
        if (fullReply.trim()) {
          await writeConversation(env, username, {
            id: conversationId,
            title: "",
            messages: [
              ...normalizedMessages,
              {
                id: crypto.randomUUID(),
                role: "assistant",
                content: fullReply.trim(),
              },
            ],
            model: selectedModel,
            mode: selectedMode,
            updatedAt: new Date().toISOString(),
          });
          await setActiveConversation(env, username, conversationId);
        }
        controller.enqueue(
          toSse({
            type: "error",
            error:
              error instanceof Error
                ? error.message
                : "Streaming request failed.",
          }),
        );
        controller.close();
      }
    },
    async cancel() {
      await upstreamReader.cancel();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
};
