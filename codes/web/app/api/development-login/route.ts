export function GET() {
  if (process.env.NODE_ENV !== "development") {
    return new Response(null, { status: 404 });
  }

  const email = process.env.DEV_LOGIN_EMAIL;
  const password = process.env.DEV_LOGIN_PASSWORD;
  if (!email || !password) {
    return new Response(null, { status: 204 });
  }

  return Response.json(
    { email, password },
    { headers: { "Cache-Control": "no-store" } },
  );
}
