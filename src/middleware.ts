import { NextResponse, type NextRequest } from "next/server";

/**
 * Protege todo o app com HTTP Basic Auth.
 * Os dados retornados (nome + CPF) são pessoais — nada fica público.
 */
export function middleware(req: NextRequest) {
  const user = process.env.APP_USERNAME;
  const pass = process.env.APP_PASSWORD;

  if (!user || !pass) {
    return new NextResponse("Acesso não configurado (APP_USERNAME/APP_PASSWORD).", { status: 503 });
  }

  const header = req.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    const decoded = atob(encoded);
    const sep = decoded.indexOf(":");
    if (sep > 0 && safeEqual(decoded.slice(0, sep), user) && safeEqual(decoded.slice(sep + 1), pass)) {
      const headers = new Headers(req.headers);
      headers.set("x-app-user", user);
      return NextResponse.next({ request: { headers } });
    }
  }

  return new NextResponse("Autenticação necessária.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="buscas", charset="UTF-8"' },
  });
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
