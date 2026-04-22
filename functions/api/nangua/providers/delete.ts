import {
  ensureChatKv,
  getAuthenticatedUser,
  json,
  readJson,
  readProviderState,
  resolveActiveProvider,
  sanitizeProvider,
  writeProviderState,
  type Env,
} from "../../_shared";

type DeleteProviderBody = {
  id?: string;
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

  const body = await readJson<DeleteProviderBody>(request);
  const providerId = body?.id?.trim();
  if (!providerId) {
    return json({ error: "id is required." }, 400);
  }

  const state = await readProviderState(env, username);
  const exists = state.providers.some((provider) => provider.id === providerId);
  if (!exists) {
    return json({ error: "Provider not found." }, 404);
  }

  const nextProviders = state.providers.filter((provider) => provider.id !== providerId);
  const nextActiveMap = { ...state.activeModelByProvider };
  delete nextActiveMap[providerId];

  const nextActiveProvider = resolveActiveProvider({
    ...state,
    providers: nextProviders,
  });

  const nextState = {
    activeProviderId: nextActiveProvider?.id || null,
    activeModelByProvider: nextActiveMap,
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
