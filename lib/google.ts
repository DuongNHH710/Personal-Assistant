import { google } from "googleapis";
import prisma from "./prisma";

export async function getGoogleAuthClients(userId: string) {
  // Get all of the user's Google accounts
  const accounts = await prisma.account.findMany({
    where: { userId, provider: "google" }
  });

  if (!accounts || accounts.length === 0) {
    throw new Error("No Google accounts linked");
  }

  const clients = accounts.map(account => {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );

    oauth2Client.setCredentials({
      access_token: account.access_token,
      refresh_token: account.refresh_token,
      scope: account.scope || undefined,
      token_type: account.token_type || undefined,
      expiry_date: account.expires_at ? account.expires_at * 1000 : undefined
    });

    // Automatically update tokens if they are refreshed
    oauth2Client.on('tokens', async (tokens) => {
      const updateData: any = { access_token: tokens.access_token };
      if (tokens.refresh_token) updateData.refresh_token = tokens.refresh_token;
      if (tokens.expiry_date) updateData.expires_at = Math.floor(tokens.expiry_date / 1000);

      await prisma.account.update({
        where: { id: account.id },
        data: updateData
      });
    });

    return { oauth2Client, accountId: account.id };
  });

  return clients;
}

export async function getUpcomingEvents(userId: string) {
  const clients = await getGoogleAuthClients(userId);
  let allEvents: any[] = [];

  const timeMin = new Date().toISOString();
  const timeMaxDate = new Date();
  timeMaxDate.setDate(timeMaxDate.getDate() + 7);
  const timeMax = timeMaxDate.toISOString();

  // Fetch events from all linked Google accounts simultaneously
  await Promise.all(clients.map(async ({ oauth2Client }) => {
    try {
      const calendar = google.calendar({ version: "v3", auth: oauth2Client });
      const response = await calendar.events.list({
        calendarId: "primary",
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: "startTime",
      });
      if (response.data.items) {
        allEvents = [...allEvents, ...response.data.items];
      }
    } catch (e: any) {
      console.error(`Failed to fetch calendar for account ${oauth2Client.credentials.access_token?.slice(0, 5)}...:`, e.message);
    }
  }));

  return allEvents;
}

export async function getIncompleteTasks(userId: string) {
  const clients = await getGoogleAuthClients(userId);
  let allTasks: any[] = [];

  await Promise.all(clients.map(async ({ oauth2Client, accountId }) => {
    try {
      const tasks = google.tasks({ version: "v1", auth: oauth2Client });
      const response = await tasks.tasks.list({
        tasklist: "@default",
        showCompleted: false,
        showHidden: false,
      });
      if (response.data.items) {
        const tagged = response.data.items.map((t) => ({ ...t, _accountId: accountId }));
        allTasks = [...allTasks, ...tagged];
      }
    } catch (e: any) {
      console.error(`Failed to fetch tasks for account ${accountId}:`, e.message);
    }
  }));

  return allTasks;
}

export async function createGoogleEvent(userId: string, eventDetails: any, accountId?: string) {
  const clients = await getGoogleAuthClients(userId);
  // Default to the first account if not specified
  const client = accountId ? clients.find(c => c.accountId === accountId) : clients[0];
  if (!client) throw new Error("Account not found");

  const calendar = google.calendar({ version: "v3", auth: client.oauth2Client });
  const response = await calendar.events.insert({
    calendarId: "primary",
    requestBody: eventDetails
  });

  return response.data;
}

export async function createGoogleTask(userId: string, taskDetails: any, accountId?: string) {
  const clients = await getGoogleAuthClients(userId);
  const client = accountId ? clients.find((c) => c.accountId === accountId) : clients[0];
  if (!client) throw new Error("Account not found");

  const tasks = google.tasks({ version: "v1", auth: client.oauth2Client });
  const response = await tasks.tasks.insert({
    tasklist: "@default",
    requestBody: taskDetails,
  });
  return response.data;
}

export async function completeGoogleTask(userId: string, taskId: string, accountId: string) {
  const clients = await getGoogleAuthClients(userId);
  const client = clients.find((c) => c.accountId === accountId);
  if (!client) throw new Error("Account not found");

  const tasks = google.tasks({ version: "v1", auth: client.oauth2Client });
  const response = await tasks.tasks.patch({
    tasklist: "@default",
    task: taskId,
    requestBody: { status: "completed" },
  });
  return response.data;
}

export async function createGoogleDocForNote(userId: string, title: string, content: string, accountId?: string) {
  const clients = await getGoogleAuthClients(userId);
  const client = accountId ? clients.find(c => c.accountId === accountId) : clients[0];
  if (!client) throw new Error("Account not found");

  const docs = google.docs({ version: "v1", auth: client.oauth2Client });

  const createResponse = await docs.documents.create({
    requestBody: { title }
  });
  
  const documentId = createResponse.data.documentId!;

  await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: [
        {
          insertText: {
            location: { index: 1 },
            text: content
          }
        }
      ]
    }
  });

  return documentId;
}

export async function listGoogleDocs(userId: string) {
  const clients = await getGoogleAuthClients(userId);
  let allDocs: any[] = [];

  await Promise.all(clients.map(async ({ oauth2Client, accountId }) => {
    try {
      const drive = google.drive({ version: "v3", auth: oauth2Client });
      const response = await drive.files.list({
        q: "mimeType='application/vnd.google-apps.document' and trashed=false",
        fields: "files(id, name, modifiedTime, webViewLink)",
        orderBy: "modifiedTime desc",
        pageSize: 15,
      });
      if (response.data.files) {
        const tagged = response.data.files.map((f) => ({
          id: `gdoc_${f.id}`,
          title: f.name || "Untitled Document",
          content: "",
          googleDocId: f.id,
          webViewLink: f.webViewLink,
          createdAt: f.modifiedTime || new Date().toISOString(),
          _accountId: accountId,
          source: "google_docs",
        }));
        allDocs = [...allDocs, ...tagged];
      }
    } catch (e: any) {
      console.error(`Failed to list Google Docs for account ${accountId}:`, e.message);
    }
  }));

  allDocs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return allDocs;
}
