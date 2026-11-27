import Link from "next/link";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center p-6 text-center space-y-4 bg-background">
      <h1 className="font-serif text-2xl font-bold text-foreground">
        Page not found
      </h1>
      <p className="text-sm text-muted-foreground max-w-sm">
        The page you requested does not exist or has moved.
      </p>
      <Link
        href="/today"
        className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 min-h-[44px]"
      >
        Back to Today
      </Link>
    </div>
  );
}
