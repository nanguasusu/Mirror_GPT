import {
  clearConversation,
  createConversation,
  ensureChatKv,
  getAuthenticatedUser,
  json,
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

  const kvError = ensureChatKv(env);
  if (kvError) {
    return kvError;
  }

  await clearConversation(env, username);
  const conversation = await createConversation(env, username);
  return json({ ok: true, conversation });
};
