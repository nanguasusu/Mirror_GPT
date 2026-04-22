import {
  createConversation,
  deleteConversationById,
  ensureChatKv,
  getAuthenticatedUser,
  json,
  readConversationById,
  readJson,
  type Env,
} from "../_shared";

type DeleteBody = {
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

  const kvError = ensureChatKv(env);
  if (kvError) {
    return kvError;
  }

  const body = await readJson<DeleteBody>(request);
  const conversationId = body?.conversationId?.trim();
  if (!conversationId) {
    return json({ error: "conversationId is required." }, 400);
  }

  const result = await deleteConversationById(env, username, conversationId);
  if (!result) {
    return json({ error: "Conversation not found." }, 404);
  }

  // Keep at least one active conversation available for the chat UI.
  if (result.conversations.length === 0) {
    const freshConversation = await createConversation(env, username);
    return json({
      ok: true,
      conversation: freshConversation,
      conversations: [
        {
          id: freshConversation.id,
          title: freshConversation.title,
          updatedAt: freshConversation.updatedAt,
        },
      ],
      activeConversationId: freshConversation.id,
    });
  }

  const activeConversation = result.activeConversationId
    ? await readConversationById(env, username, result.activeConversationId)
    : null;

  return json({
    ok: true,
    conversation: activeConversation,
    conversations: result.conversations,
    activeConversationId: result.activeConversationId,
  });
};
