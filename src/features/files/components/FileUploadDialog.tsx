"use client";

import {
  UnifiedUploadDialog,
  type UnifiedUploadDialogProps,
} from "@/components/shared/UnifiedUploadDialog";

export type FileUploadDialogProps = Omit<UnifiedUploadDialogProps, "mode">;

export function FileUploadDialog(props: FileUploadDialogProps) {
  return <UnifiedUploadDialog mode="file" {...props} />;
}
