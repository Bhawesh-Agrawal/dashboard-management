import { refreshInsights } from "@/features/dashboard/lib/actions";
import { NextResponse } from "next/server";

// Force Node.js runtime if there are issues with fs/promises in Edge
export const runtime = 'nodejs';
export const revalidate = 0;

export async function GET(request: Request) {
  // In a production app, verify a secret token for the cron job:
  // const authHeader = request.headers.get('authorization');
  // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  //   return new Response('Unauthorized', { status: 401 });
  // }

  try {
    const result = await refreshInsights();
    
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: result.data });
  } catch (err) {
    console.error("Cron failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
