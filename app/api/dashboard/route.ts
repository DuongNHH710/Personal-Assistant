import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/authOptions";
import { getUpcomingEvents, getIncompleteTasks, listGoogleDocs } from "@/lib/google";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id as string;
    let events: any[] = [];
    let tasks: any[] = [];
    let googleDocs: any[] = [];

    // Fetch all Google data in parallel; failures are isolated
    try {
      [events, tasks, googleDocs] = await Promise.all([
        getUpcomingEvents(userId),
        getIncompleteTasks(userId),
        listGoogleDocs(userId),
      ]);
    } catch (apiError: unknown) {
      console.error("Google API Error:", apiError instanceof Error ? apiError.message : String(apiError));
    }

    // Local notes saved by the app
    const localNotes = await prisma.note.findMany({
      where: { account: { userId } },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    // Merge: skip Google Docs that were already synced locally (matched by googleDocId)
    const syncedDocIds = new Set(localNotes.map((n) => n.googleDocId).filter(Boolean));
    const uniqueGoogleDocs = googleDocs.filter((d) => !syncedDocIds.has(d.googleDocId));

    const allNotes = [
      ...localNotes.map((n) => ({ ...n, source: "local" })),
      ...uniqueGoogleDocs,
    ].slice(0, 25);

    // Build linked accounts info from stored id_tokens
    const userAccounts = await prisma.account.findMany({ where: { userId } });
    const linkedAccounts = userAccounts.map((acc) => {
      let email = "Unknown Email";
      let picture = null;
      if (acc.id_token) {
        try {
          const payload = JSON.parse(
            Buffer.from(acc.id_token.split(".")[1], "base64").toString()
          );
          email = payload.email || email;
          picture = payload.picture || picture;
        } catch {}
      }
      return { id: acc.id, provider: acc.provider, email, picture };
    });

    return NextResponse.json({ events, tasks, notes: allNotes, linkedAccounts });
  } catch (error: unknown) {
    console.error("Dashboard API Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
