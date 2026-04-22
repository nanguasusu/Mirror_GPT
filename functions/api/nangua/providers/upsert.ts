import {
  ensureChatKv,
  getAuthenticatedUser,
  json,
  normalizeProviderBaseUrl,
  readJson,
  readProviderState,
  resolveActiveProvider,
  sanitizeProvider,
  writeProviderState,
  type Env,
  type StoredProvider,
} from "../../_shared";

type UpsertProviderBody = {
  id?: string;
  name?: string;
  baseUrl?: string;
  apiKey?: string;
  enabled?: boolean;
  setActive?: boolean;
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

  const body = await readJson<UpsertProviderBody>(request);
  if (!body) {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const id = body.id?.trim();
  const name = body.name?.trim();
  const baseUrlRaw = body.baseUrl?.trim();
  if (!name || !baseUrlRaw) {
    return json({ error: "name and baseUrl are required." }, 400);
  }

  let baseUrl = "";
  try {
    baseUrl = normalizeProviderBaseUrl(baseUrlRaw);
  } catch {
    return json({ error: "Invalid baseUrl." }, 400);
  }

  const state = await readProviderState(env, username);
  const current = id ? state.providers.find((provider) => provider.id === id) : undefined;
  const now = new Date().toISOString();
  const providerId = current?.id || crypto.randomUUID();

  const provider: StoredProvider = {
    id: providerId,
    name,
    baseUrl,
    apiKey: body.apiKey?.trim() ? body.apiKey.trim() : current?.apiKey || "",
    enabled: body.enabled ?? current?.enabled ?? true,
    models: current?.models || [],
    updatedAt: now,
    lastModelSyncAt: current?.lastModelSyncAt,
  };

  if (!provider.apiKey) {
    return json({ error: "apiKey is required for new providers." }, 400);
  }

  const nextProviders = state.providers
    .filter((item) => item.id !== providerId)
    .concat(provider)
    .sort((left, right) => left.name.localeCompare(right.name));

  const activeProvider =
    body.setActive || !state.activeProviderId
      ? provider
      : resolveActiveProvider({ ...state, providers: nextProviders });

  const nextState = {
    activeProviderId: activeProvider?.id || provider.id,
    activeModelByProvider: {
      ...state.activeModelByProvider,
      [provider.id]:
        state.activeModelByProvider[provider.id] ||
        provider.models[0] ||
        "",
    },
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
