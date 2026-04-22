import { getAuthenticatedUser, json, type Env } from "../_shared";

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

  if (!env.CHAT_KV) {
    return json(
      {
        ok: false,
        kvBound: false,
        error:
          "CHAT_KV binding is missing in current Pages runtime (check Production/Preview binding separately).",
      },
      500,
    );
  }

  const key = `kv-debug:${username}:${crypto.randomUUID()}`;
  const value = new Date().toISOString();

  try {
    await env.CHAT_KV.put(key, value);
    const readBack = await env.CHAT_KV.get(key);
    await env.CHAT_KV.delete(key);

    return json({
      ok: true,
      kvBound: true,
      writeOk: true,
      readOk: readBack === value,
    });
  } catch (error) {
    return json(
      {
        ok: false,
        kvBound: true,
        writeOk: false,
        error:
          error instanceof Error
            ? error.message
            : "KV write/read probe failed.",
      },
      500,
    );
  }
};
