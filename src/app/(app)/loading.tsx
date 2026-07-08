import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4 animate-in fade-in duration-300">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
          <Loader2 className="h-10 w-10 text-primary animate-spin relative z-10" />
        </div>
        <p className="text-sm text-muted-foreground font-medium animate-pulse">
          Loading command center...
        </p>
      </div>
    </div>
  );
}
