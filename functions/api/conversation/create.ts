import {
  createConversation,
  getAuthenticatedUser,
  json,
  readConversationIndex,
  resolvePreferredModelForUser,
  type Env,
} from "../_shared";

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

  const preferredModel = await resolvePreferredModelForUser(env, username);
  const conversation = await createConversation(env, username, { preferredModel });
  const index = await readConversationIndex(env, username);
  return json({
    ok: true,
    conversation,
    conversations: index.conversations,
    activeConversationId: conversation.id,
  });
};
