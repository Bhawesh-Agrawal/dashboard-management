"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export interface AttemptSheetTarget {
  problemId: string;
  problemTitle: string;
  isRevision: boolean;
}

interface AttemptLogSheetProps {
  target: AttemptSheetTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AttemptLogSheet({ target, open, onOpenChange }: AttemptLogSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <SheetHeader className="p-0 pb-3">
          <SheetTitle>
            {target ? `Log Attempt — ${target.problemTitle}` : "Log Attempt"}
          </SheetTitle>
        </SheetHeader>
        <p className="text-xs text-muted-foreground">
          Attempt form wiring completes in Step 5.
        </p>
      </SheetContent>
    </Sheet>
  );
}
