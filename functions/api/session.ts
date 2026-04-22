import {
  createConversation,
  getAuthenticatedUser,
  getDefaultUsername,
  json,
  readConversation,
  readConversationIndex,
  readProviderState,
  resolveActiveProvider,
  sanitizeProvider,
  type Env,
} from "./_shared";

export const onRequestGet = async ({
  env,
  request,
}: {
  env: Env;
  request: Request;
}) => {
  const username = await getAuthenticatedUser(request, env);
  if (!username) {
    return json(
      {
        authenticated: false,
        username: getDefaultUsername(env),
        models: [],
        providers: [],
        activeProviderId: null,
        activeModelByProvider: {},
        kvBound: Boolean(env.CHAT_KV),
      },
      200,
    );
  }

  const index = await readConversationIndex(env, username);
  const providerState = await readProviderState(env, username);
  const activeProvider = resolveActiveProvider(providerState);
  const activeModel =
    (activeProvider &&
      providerState.activeModelByProvider[activeProvider.id]) ||
    activeProvider?.models[0] ||
    "";

  const conversation =
    index.activeConversationId || index.conversations.length > 0
      ? await readConversation(env, username)
      : await createConversation(env, username);
  const nextIndex = await readConversationIndex(env, username);
  return json({
    authenticated: true,
    username,
    conversation,
    conversations: nextIndex.conversations,
    activeConversationId: nextIndex.activeConversationId || conversation.id,
    models: activeProvider?.models || [],
    providers: providerState.providers.map(sanitizeProvider),
    activeProviderId: activeProvider?.id || null,
    activeModelByProvider: providerState.activeModelByProvider,
    selectedModel: activeModel,
    kvBound: Boolean(env.CHAT_KV),
  });
};
