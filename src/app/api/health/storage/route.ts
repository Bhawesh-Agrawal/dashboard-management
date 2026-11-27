import { NextResponse } from "next/server";
import { HeadBucketCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getCurrentUserId } from "@/lib/auth";
import { getS3Client, BUCKET_NAME } from "@/lib/s3/client";

export async function GET() {
  try {
    await getCurrentUserId();
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const bucket = BUCKET_NAME;
    const client = getS3Client();

    await Promise.race([
      (async () => {
        await client.send(new HeadBucketCommand({ Bucket: bucket }));
        await client.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }));
      })(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Storage check timed out")), 3000)
      ),
    ]);

    return NextResponse.json({ ok: true, reachable: true, bucket });
  } catch {
    return NextResponse.json(
      { ok: false, reachable: false, error: "Files are unavailable: storage offline" },
      { status: 503 }
    );
  }
}
