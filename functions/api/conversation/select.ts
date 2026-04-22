import {
  getAuthenticatedUser,
  json,
  readConversationById,
  readConversationIndex,
  readJson,
  setActiveConversation,
  type Env,
} from "../_shared";

type SelectBody = {
  conversationId?: string;
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

  const body = await readJson<SelectBody>(request);
  const conversationId = body?.conversationId?.trim();
  if (!conversationId) {
    return json({ error: "conversationId is required." }, 400);
  }

  const index = await readConversationIndex(env, username);
  const exists = index.conversations.some((conversation) => conversation.id === conversationId);
  if (!exists) {
    return json({ error: "Conversation not found." }, 404);
  }

  await setActiveConversation(env, username, conversationId);
  const conversation = await readConversationById(env, username, conversationId);
  return json({
    ok: true,
    conversation,
    conversations: index.conversations,
    activeConversationId: conversationId,
  });
};
