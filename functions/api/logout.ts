import { clearSessionCookie, json } from "./_shared";

export const onRequestPost = async ({ request }: { request: Request }) =>
  json(
    { ok: true },
    200,
    {
      "Set-Cookie": clearSessionCookie(request),
    },
  );
