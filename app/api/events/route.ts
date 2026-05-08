import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/authOptions";
import { createGoogleEvent, getUpcomingEvents } from "@/lib/google";

// POST: Create a new event in Google Calendar
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { title, description, startDateTime, endDateTime, accountId } = body;

    if (!title || !startDateTime) {
      return NextResponse.json({ error: "Title and start date are required" }, { status: 400 });
    }

    const start = new Date(startDateTime);
    const end = endDateTime ? new Date(endDateTime) : new Date(start.getTime() + 60 * 60 * 1000); // Default 1 hour

    const event = await createGoogleEvent(session.user.id as string, {
      summary: title,
      description: description || "",
      start: { dateTime: start.toISOString(), timeZone: "Asia/Bangkok" },
      end: { dateTime: end.toISOString(), timeZone: "Asia/Bangkok" },
    }, accountId);

    return NextResponse.json({ success: true, event });
  } catch (error: unknown) {
    console.error("Create event error:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
