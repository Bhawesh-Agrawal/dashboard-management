export default function Loading() {
  return (
    <div className="w-full space-y-4 animate-pulse pt-2">
      {/* Top progress bar indicator */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-primary/20 z-50 overflow-hidden">
        <div className="h-full bg-primary animate-indeterminate w-1/3 rounded-full" />
      </div>

      <div className="h-8 w-48 bg-muted rounded-md mb-6" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-4">
          <div className="h-32 bg-muted/60 rounded-xl" />
          <div className="h-48 bg-muted/40 rounded-xl" />
        </div>
        <div className="space-y-4">
          <div className="h-40 bg-muted/60 rounded-xl" />
          <div className="h-32 bg-muted/40 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
