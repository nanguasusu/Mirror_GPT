import {
  getAuthenticatedUser,
  json,
  readConversationById,
  readConversationIndex,
  readJson,
  renameConversationById,
  type Env,
} from "../_shared";

type RenameBody = {
  conversationId?: string;
  title?: string;
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

  const body = await readJson<RenameBody>(request);
  const conversationId = body?.conversationId?.trim();
  const title = body?.title?.trim() || "";

  if (!conversationId) {
    return json({ error: "conversationId is required." }, 400);
  }

  if (!title) {
    return json({ error: "title is required." }, 400);
  }

  const conversation = await renameConversationById(
    env,
    username,
    conversationId,
    title,
  );
  if (!conversation) {
    return json({ error: "Conversation not found." }, 404);
  }

  const index = await readConversationIndex(env, username);
  const activeConversation = index.activeConversationId
    ? await readConversationById(env, username, index.activeConversationId)
    : null;

  return json({
    ok: true,
    conversation,
    conversations: index.conversations,
    activeConversationId: index.activeConversationId,
    activeConversation,
  });
};
