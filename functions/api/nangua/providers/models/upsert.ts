import {
  ensureChatKv,
  getAuthenticatedUser,
  json,
  readJson,
  readProviderState,
  sanitizeProvider,
  writeProviderState,
  type Env,
} from "../../../_shared";

type UpsertModelBody = {
  providerId?: string;
  model?: string;
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

  const body = await readJson<UpsertModelBody>(request);
  const providerId = body?.providerId?.trim();
  const model = body?.model?.trim();
  if (!providerId || !model) {
    return json({ error: "providerId and model are required." }, 400);
  }

  const state = await readProviderState(env, username);
  const provider = state.providers.find((item) => item.id === providerId);
  if (!provider) {
    return json({ error: "Provider not found." }, 404);
  }

  const now = new Date().toISOString();
  const nextProviders = state.providers.map((item) =>
    item.id === providerId
      ? {
          ...item,
          models: Array.from(new Set([...item.models, model])).sort((left, right) =>
            left.localeCompare(right),
          ),
          updatedAt: now,
        }
      : item,
  );

  const nextProvider = nextProviders.find((item) => item.id === providerId);
  const nextActiveByProvider = { ...state.activeModelByProvider };
  if (!nextActiveByProvider[providerId] || !nextProvider?.models.includes(nextActiveByProvider[providerId])) {
    nextActiveByProvider[providerId] = nextProvider?.models[0] || "";
  }

  const nextState = {
    activeProviderId: state.activeProviderId,
    activeModelByProvider: nextActiveByProvider,
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
