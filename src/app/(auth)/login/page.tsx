import { login } from "@/features/auth/lib/actions";
import { sanitizeReturnUrl } from "@/features/auth/lib/return-url";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="page-heading text-3xl">CodexDash</h1>
          <p className="text-sm text-muted-foreground">Sign in to your account</p>
        </div>

        <form action={login} className="space-y-4">
          <SearchParamsMessage searchParams={searchParams} />
          <ReturnUrlField searchParams={searchParams} />

          <div className="space-y-2">
            <label htmlFor="email" className="section-label">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="you@example.com"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="section-label">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Sign In
          </button>
        </form>

        {process.env.ALLOW_SIGNUP === "true" && (
          <p className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <a href="/signup" className="underline underline-offset-4 hover:text-foreground">
              Sign up
            </a>
          </p>
        )}
      </div>
    </div>
  );
}

async function SearchParamsMessage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;
  const message = typeof params.message === "string" ? params.message : null;

  if (error) {
    return (
      <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (message) {
    return (
      <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
        {message}
      </div>
    );
  }

  return null;
}

async function ReturnUrlField({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const raw = typeof params.returnUrl === "string" ? params.returnUrl : null;
  if (!raw) return null;
  return <input type="hidden" name="returnUrl" value={sanitizeReturnUrl(raw)} />;
}
