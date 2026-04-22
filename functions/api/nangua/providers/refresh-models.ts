import {
  buildProviderEndpoint,
  ensureChatKv,
  getAuthenticatedUser,
  json,
  readJson,
  readProviderState,
  sanitizeProvider,
  writeProviderState,
  type Env,
} from "../../_shared";

type RefreshModelsBody = {
  id?: string;
};

type ModelsResponse = {
  data?: Array<{
    id?: string;
  }>;
};

const modelBlacklist = [
  "embed",
  "clip",
  "reward",
  "guard",
  "safety",
  "pii",
  "parse",
  "translate",
  "topic-control",
];

const isChatModel = (modelId: string) => {
  const normalized = modelId.toLowerCase();
  return !modelBlacklist.some((keyword) => normalized.includes(keyword));
};

const parseUpstreamError = async (response: Response) => {
  try {
    const data = (await response.json()) as {
      error?: { message?: string };
    };
    if (data.error?.message) {
      return data.error.message;
    }
  } catch {
    // ignore
  }

  return `Model fetch failed (${response.status}).`;
};

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

  const kvError = ensureChatKv(env);
  if (kvError) {
    return kvError;
  }

  const body = await readJson<RefreshModelsBody>(request);
  const providerId = body?.id?.trim();
  if (!providerId) {
    return json({ error: "id is required." }, 400);
  }

  const state = await readProviderState(env, username);
  const provider = state.providers.find((item) => item.id === providerId);
  if (!provider) {
    return json({ error: "Provider not found." }, 404);
  }

  const response = await fetch(buildProviderEndpoint(provider.baseUrl, "models"), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    return json({ error: await parseUpstreamError(response) }, response.status || 500);
  }

  let payload: ModelsResponse | null = null;
  try {
    payload = (await response.json()) as ModelsResponse;
  } catch {
    return json({ error: "Invalid models response format." }, 502);
  }

  const models = Array.isArray(payload.data)
    ? Array.from(
        new Set(
          payload.data
            .map((item) => item.id?.trim())
            .filter((item): item is string => Boolean(item))
            .filter(isChatModel),
        ),
      ).sort((left, right) => left.localeCompare(right))
    : [];

  const now = new Date().toISOString();
  const nextProviders = state.providers.map((item) =>
    item.id === providerId
      ? {
          ...item,
          models,
          updatedAt: now,
          lastModelSyncAt: now,
        }
      : item,
  );

  const nextActive = { ...state.activeModelByProvider };
  if (!nextActive[providerId] && models.length > 0) {
    nextActive[providerId] = models[0];
  } else if (nextActive[providerId] && !models.includes(nextActive[providerId])) {
    nextActive[providerId] = models[0] || "";
  }

  const nextState = {
    activeProviderId: state.activeProviderId,
    activeModelByProvider: nextActive,
    providers: nextProviders,
  };

  await writeProviderState(env, username, nextState);
  return json({
    ok: true,
    activeProviderId: nextState.activeProviderId,
    activeModelByProvider: nextState.activeModelByProvider,
    providers: nextState.providers.map(sanitizeProvider),
  });
};
