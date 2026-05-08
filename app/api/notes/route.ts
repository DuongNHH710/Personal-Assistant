import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/authOptions";
import { createGoogleDocForNote } from "@/lib/google";
import prisma from "@/lib/prisma";

// POST: Create a new note (stored locally + synced to Google Docs)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { title, content, accountId } = body;

    if (!title || !content) {
      return NextResponse.json({ error: "Title and content are required" }, { status: 400 });
    }

    // Find the account to link the note to
    const account = await prisma.account.findFirst({
      where: { userId: session.user.id as string, provider: "google", ...(accountId ? { id: accountId } : {}) }
    });

    if (!account) {
      return NextResponse.json({ error: "No Google account linked" }, { status: 400 });
    }

    // Sync to Google Docs
    let googleDocId: string | null = null;
    try {
      googleDocId = await createGoogleDocForNote(session.user.id as string, title, content, accountId);
    } catch (docError: any) {
      console.warn("Failed to sync to Google Docs:", docError.message);
    }

    // Save to local database
    const note = await prisma.note.create({
      data: {
        title,
        content,
        googleDocId,
        accountId: account.id,
      }
    });

    return NextResponse.json({ success: true, note });
  } catch (error: any) {
    console.error("Create note error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
