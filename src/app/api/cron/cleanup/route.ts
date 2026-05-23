import { NextResponse } from "next/server";
import { cleanupExpiredReservations } from "@/lib/reservations";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const cleaned = await cleanupExpiredReservations();
    return NextResponse.json({
      success: true,
      message: `Cleaned up ${cleaned} expired reservations.`,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Cron cleanup error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 }
    );
  }
}

// Support GET for testing convenience
export async function GET() {
  return POST();
}
