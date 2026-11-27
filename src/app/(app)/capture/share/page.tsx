import { extractSharedCapture } from "@/features/notes/lib/share-target";
import { ShareCaptureClient } from "@/features/notes/components/ShareCaptureClient";

export const dynamic = "force-dynamic";

export default async function ShareCapturePage({
  searchParams,
}: {
  searchParams: Promise<{ title?: string; text?: string; url?: string }>;
}) {
  const params = await searchParams;
  const shared = extractSharedCapture({
    title: params.title,
    text: params.text,
    url: params.url,
  });

  return <ShareCaptureClient shared={shared} />;
}
