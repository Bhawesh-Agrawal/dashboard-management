import { signup } from "@/features/auth/lib/actions";
import { isSignupAllowed } from "@/features/auth/lib/signup-guard";

export const dynamic = "force-dynamic";

export default function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  if (!isSignupAllowed()) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="page-heading text-3xl">Registration closed</h1>
          <p className="text-sm text-muted-foreground">
            New account signups are currently disabled.
          </p>
          <p className="text-sm text-muted-foreground">
            <a href="/login" className="underline underline-offset-4 hover:text-foreground">
              Return to sign in
            </a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="page-heading text-3xl">CodexDash</h1>
          <p className="text-sm text-muted-foreground">Create your account</p>
        </div>

        <form action={signup} className="space-y-4">
          <ErrorMessage searchParams={searchParams} />

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
              minLength={6}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Create Account
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <a href="/login" className="underline underline-offset-4 hover:text-foreground">
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
}

async function ErrorMessage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;

  if (error) {
    return (
      <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
        {error}
      </div>
    );
  }

  return null;
}
