import {
  createConversation,
  getAllowedModels,
  getAuthenticatedUser,
  getDefaultUsername,
  json,
  readConversation,
  readConversationIndex,
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
        models: getAllowedModels(env),
        kvBound: Boolean(env.CHAT_KV),
      },
      200,
    );
  }

  const index = await readConversationIndex(env, username);
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
    models: getAllowedModels(env),
    kvBound: Boolean(env.CHAT_KV),
  });
};
