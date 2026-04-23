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

type SelectProviderBody = {
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

  const body = await readJson<SelectProviderBody>(request);
  if (!body?.providerId?.trim()) {
    return json({ error: "providerId is required." }, 400);
  }

  const providerId = body.providerId.trim();
  const state = await readProviderState(env, username);
  const provider = state.providers.find((item) => item.id === providerId && item.enabled);
  if (!provider) {
    return json({ error: "Provider not found or disabled." }, 404);
  }

  const selectedModel = body.model?.trim();
  if (selectedModel && !provider.models.includes(selectedModel)) {
    return json({ error: "Selected model is not available for this provider." }, 400);
  }

  const nextSelectedModel =
    selectedModel ||
    state.activeModelByProvider[provider.id] ||
    provider.models[0] ||
    "";

  const nextState = {
    activeProviderId: provider.id,
    activeModelByProvider: {
      ...state.activeModelByProvider,
      [provider.id]: nextSelectedModel,
    },
    providers: state.providers,
  };

  const activeProvider = resolveActiveProvider(nextState);
  await writeProviderState(env, username, {
    ...nextState,
    activeProviderId: activeProvider?.id || provider.id,
  });

  return json({
    ok: true,
    activeProviderId: activeProvider?.id || provider.id,
    activeModelByProvider: nextState.activeModelByProvider,
    providers: state.providers.map(sanitizeProvider),
  });
};
