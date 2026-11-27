"use client";

import {
  UnifiedUploadDialog,
  type UnifiedUploadDialogProps,
} from "@/components/shared/UnifiedUploadDialog";

export type DocumentUploadDialogProps = Omit<UnifiedUploadDialogProps, "mode">;

export function DocumentUploadDialog(props: DocumentUploadDialogProps) {
  return <UnifiedUploadDialog mode="document" {...props} />;
}
