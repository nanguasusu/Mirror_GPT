import {
  ensureChatKv,
  getAuthenticatedUser,
  json,
  readProviderState,
  resolveActiveProvider,
  sanitizeProvider,
  type Env,
} from "../_shared";

export const onRequestGet = async ({
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

  const state = await readProviderState(env, username);
  const activeProvider = resolveActiveProvider(state);

  return json({
    ok: true,
    activeProviderId: activeProvider?.id || state.activeProviderId || null,
    activeModelByProvider: state.activeModelByProvider,
    providers: state.providers.map(sanitizeProvider),
  });
};
