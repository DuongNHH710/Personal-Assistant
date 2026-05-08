import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/authOptions";
import { createGoogleEvent, createGoogleTask, createGoogleDocForNote, getGoogleAuthClients } from "@/lib/google";
import prisma from "@/lib/prisma";

// Route segment config - increase body size limit for audio uploads
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Upload large audio files to Gemini File API (avoids 20MB inline_data limit)
async function uploadToGeminiFileAPI(
  audioBuffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  const boundary = `gemini_upload_${Date.now()}`;
  const metadataJson = JSON.stringify({ file: { displayName: fileName } });

  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=utf-8\r\n\r\n${metadataJson}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    audioBuffer,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "multipart",
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini File API upload failed: ${errText}`);
  }

  const result = await response.json();
  const fileUri = result.file?.uri;
  if (!fileUri) throw new Error("File API returned no URI");
  return fileUri;
}

// Transcribe audio — uses inline_data for small files, File API for large ones
async function transcribeAudio(
  audioBase64: string,
  mimeType: string,
  audioBuffer: Buffer,
  fileName: string
): Promise<string> {
  const SIZE_THRESHOLD = 5 * 1024 * 1024; // 5 MB

  let audioPart: any;
  if (audioBuffer.byteLength > SIZE_THRESHOLD) {
    console.log(`Large audio (${(audioBuffer.byteLength / 1024 / 1024).toFixed(1)} MB) — using Gemini File API`);
    const fileUri = await uploadToGeminiFileAPI(audioBuffer, mimeType, fileName);
    audioPart = { fileData: { mimeType, fileUri } };
  } else {
    audioPart = { inline_data: { mime_type: mimeType, data: audioBase64 } };
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: "Please transcribe this audio recording accurately. Return only the raw transcription text, nothing else." },
            audioPart,
          ],
        }],
      }),
    }
  );

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Transcription failed: ${err.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// AI extraction using Gemini
async function extractEntities(transcription: string): Promise<{
  summary: string;
  events: Array<{ title: string; description: string; dateTime: string; endDateTime?: string }>;
  tasks: Array<{ title: string; notes: string; dueDate?: string }>;
  notes: Array<{ title: string; content: string }>;
}> {
  const today = new Date().toISOString().split("T")[0];
  const prompt = `You are an intelligent assistant analyzing a meeting/recording transcription. Today's date is ${today}.

Extract the following from this transcription and return as valid JSON:
1. "summary" - A concise summary of the main discussion points and key ideas
2. "events" - Calendar events mentioned (meetings, appointments, deadlines with specific times/dates). Each event: { "title", "description", "dateTime" (ISO 8601), "endDateTime" (ISO 8601, optional) }
3. "tasks" - Action items and to-dos. Each task: { "title", "notes", "dueDate" (YYYY-MM-DD, optional) }
4. "notes" - Key ideas, decisions, or information worth saving. Each note: { "title", "content" }

Transcription:
${transcription}

Return ONLY a valid JSON object with keys: summary, events, tasks, notes. No markdown, no explanation.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json"
        }
      })
    }
  );

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`AI extraction failed: ${err.error?.message || response.statusText}`);
  }

  const data = await response.json();
  const jsonText = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  return JSON.parse(jsonText);
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: "GEMINI_API_KEY is not configured in .env" }, { status: 500 });
    }

    const formData = await req.formData();
    const rawJson = formData.get("rawJson") as string | null;
    const audioFile = formData.get("audio") as File | null;
    const accountId = formData.get("accountId") as string | null;
    const syncToGoogle = formData.get("syncToGoogle") !== "false";
    const timezone = (formData.get("timezone") as string) || "UTC";

    if (!rawJson && !audioFile) {
      return NextResponse.json({ error: "No audio file or JSON data provided" }, { status: 400 });
    }

    let transcription = "";
    let extracted: Awaited<ReturnType<typeof extractEntities>>;

    if (rawJson) {
      // --- MANUAL JSON IMPORT PATH ---
      console.log("Processing manual JSON import");
      try {
        extracted = JSON.parse(rawJson);
        transcription = "Transcribed and parsed externally via Gemini Web.";
      } catch (e: any) {
        return NextResponse.json({ error: `Invalid JSON format: ${e.message}` }, { status: 400 });
      }
    } else {
      // --- AUDIO API PATH ---

    // Convert file to base64
    const arrayBuffer = await audioFile.arrayBuffer();
    const audioBase64 = Buffer.from(arrayBuffer).toString("base64");

      // Normalize mime type - MediaRecorder often returns empty or with codecs suffix
      let mimeType = audioFile!.type || "audio/webm";
      // Strip codec parameters for Gemini compatibility (e.g. "audio/webm;codecs=opus" -> "audio/webm")
      mimeType = mimeType.split(";")[0].trim();
      // Map unsupported types
      const supportedMimes = ["audio/wav", "audio/mp3", "audio/mpeg", "audio/mp4", "audio/webm", "audio/ogg", "video/mp4", "video/webm"];
      if (!supportedMimes.includes(mimeType)) mimeType = "audio/webm";

      console.log(`Processing audio: ${audioFile!.name}, size: ${arrayBuffer.byteLength} bytes, type: ${mimeType}`);

      // Step 1: Transcribe
      try {
        transcription = await transcribeAudio(audioBase64, mimeType, Buffer.from(arrayBuffer), audioFile!.name || "audio.webm");
      } catch (transcribeError: any) {
        return NextResponse.json({ error: `Transcription failed: ${transcribeError.message}` }, { status: 500 });
      }

      // Step 2: Extract entities with AI
      try {
        extracted = await extractEntities(transcription);
      } catch (extractError: any) {
        return NextResponse.json({ error: `AI extraction failed: ${extractError.message}` }, { status: 500 });
      }
    }

    const results = {
      transcription,
      summary: extracted.summary,
      events: [] as any[],
      tasks: [] as any[],
      notes: [] as any[],
      syncErrors: [] as string[],
    };

    // Step 3: Sync to Google if requested
    if (syncToGoogle) {
      const userId = session.user.id as string;

      // Pre-fetch auth clients to avoid repeated DB queries in loops
      let authClients: any[] | undefined;
      try {
        authClients = await getGoogleAuthClients(userId);
      } catch (e) {
        console.error("Failed to fetch Google auth clients:", e);
      }

      // Sync events
      for (const ev of extracted.events || []) {
        try {
          const created = await createGoogleEvent(userId, {
            summary: ev.title,
            description: ev.description,
            start: { dateTime: ev.dateTime, timeZone: timezone },
            end: { dateTime: ev.endDateTime || ev.dateTime, timeZone: timezone }
          }, accountId || undefined, authClients);
          results.events.push(created);
        } catch (e: any) {
          results.syncErrors.push(`Event "${ev.title}": ${e.message}`);
        }
      }

      // Sync tasks
      for (const task of extracted.tasks || []) {
        try {
          const taskPayload: any = { title: task.title, notes: task.notes };
          if (task.dueDate) taskPayload.due = new Date(task.dueDate).toISOString();
          const created = await createGoogleTask(userId, taskPayload, accountId || undefined, authClients);
          results.tasks.push(created);
        } catch (e: any) {
          results.syncErrors.push(`Task "${task.title}": ${e.message}`);
        }
      }

      // Sync notes to Google Docs + save locally
      const account = await prisma.account.findFirst({
        where: { userId, provider: "google", ...(accountId ? { id: accountId } : {}) }
      });

      for (const note of extracted.notes || []) {
        try {
          let googleDocId: string | null = null;
          if (account) {
            try {
              googleDocId = await createGoogleDocForNote(userId, note.title, note.content, accountId || undefined, authClients);
            } catch (docError: any) {
              results.syncErrors.push(`Note "${note.title}" (Docs): ${docError.message}`);
            }
          }

          if (account) {
            const savedNote = await prisma.note.create({
              data: { title: note.title, content: note.content, googleDocId, accountId: account.id }
            });
            results.notes.push(savedNote);
          }
        } catch (e: any) {
          results.syncErrors.push(`Note "${note.title}": ${e.message}`);
        }
      }
    }

    return NextResponse.json(results);
  } catch (error: any) {
    console.error("Transcribe API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

