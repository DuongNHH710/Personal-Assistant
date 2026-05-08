import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/authOptions";
import { createGoogleTask } from "@/lib/google";

// POST: Create a new task in Google Tasks
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { title, notes, dueDate, accountId } = body;

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const taskDetails: any = {
      title,
      notes: notes || "",
    };

    if (dueDate) {
      // Google Tasks API expects RFC 3339 timestamp for due date
      const d = new Date(dueDate);
      d.setHours(0, 0, 0, 0);
      taskDetails.due = d.toISOString();
    }

    const task = await createGoogleTask(session.user.id as string, taskDetails, accountId);
    return NextResponse.json({ success: true, task });
  } catch (error: unknown) {
    console.error("Create task error:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
