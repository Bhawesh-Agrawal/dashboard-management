export function sanitizeReturnUrl(raw: string | null | undefined): string {
  if (!raw || typeof raw !== "string") return "/today";
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return "/today";
  }
  return trimmed;
}

export function buildLoginRedirectUrl(requestUrl: URL): URL {
  const target = new URL(requestUrl.toString());
  const originalPath = `${requestUrl.pathname}${requestUrl.search}`;
  target.pathname = "/login";
  target.search = "";
  if (originalPath && originalPath !== "/" && !originalPath.startsWith("/login")) {
    target.searchParams.set("returnUrl", originalPath);
  }
  return target;
}
