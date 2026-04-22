import {
  createSessionCookie,
  createConversation,
  getDefaultPassword,
  getDefaultUsername,
  json,
  readConversation,
  readConversationIndex,
  readJson,
  resolvePreferredModelForUser,
  type Env,
} from "./_shared";

type LoginBody = {
  username?: string;
  password?: string;
};

export const onRequestPost = async ({
  env,
  request,
}: {
  env: Env;
  request: Request;
}) => {
  const body = await readJson<LoginBody>(request);
  if (!body) {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const username = body.username?.trim() || "";
  const password = body.password || "";

  if (
    username !== getDefaultUsername(env) ||
    password !== getDefaultPassword(env)
  ) {
    return json({ error: "Invalid username or password." }, 401);
  }

  const conversation = await readConversation(env, username);
  const index = await readConversationIndex(env, username);
  const preferredModel = await resolvePreferredModelForUser(env, username);
  const activeConversation =
    index.activeConversationId || index.conversations.length > 0
      ? conversation
      : await createConversation(env, username, { preferredModel });
  const nextIndex = await readConversationIndex(env, username);
  return json(
    {
      ok: true,
      username,
      conversation: activeConversation,
      conversations: nextIndex.conversations,
      activeConversationId: nextIndex.activeConversationId || activeConversation.id,
    },
    200,
    {
      "Set-Cookie": await createSessionCookie(username, env, request),
    },
  );
};
