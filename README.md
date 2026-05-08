# Personal Assistant

An AI-powered workspace that acts as your personal assistant. It seamlessly syncs tasks, events, and notes across multiple Google Accounts and features intelligent audio extraction.

## Features

- **Multi-Account Integration:** Link multiple Google accounts to sync events, tasks, and notes simultaneously across primary and secondary accounts.
- **Dashboard View:** A 7-day timeline view of upcoming events and pending tasks from connected accounts.
- **Calendar View:** A structured 7-day grid that visualizes your schedule and commitments.
- **Task Management:** View pending tasks, manage priorities, and mark items as complete with optimistic UI updates.
- **Notes & Google Docs Integration:** Save quick notes directly or sync them seamlessly as Google Docs in Google Drive.
- **Voice Transcription & Extraction:** Upload or record audio directly. The app can process audio to intelligently extract summaries, tasks, events, and notes, automatically syncing them back to your selected Google account.
- **Manual Data Extraction:** Support for pasting manual JSON payloads (from external AI tools) to create tasks, notes, and events instantly.

## Tech Stack

- **Framework:** [Next.js](https://nextjs.org) (App Router)
- **Language:** TypeScript
- **Database ORM:** [Prisma](https://www.prisma.io/)
- **Authentication:** NextAuth.js (Prisma adapter) with Google OAuth
- **Database:** PostgreSQL (or SQLite via Prisma depending on env config)
- **Styling:** CSS Modules & Tailwind CSS

## Prerequisites

Before running the application, make sure you have:

- Node.js (v20+ recommended)
- A PostgreSQL database (or an alternative relational DB configured in Prisma)
- Google Cloud Console Project with OAuth 2.0 Client ID setup (enabling Calendar, Tasks, and Docs APIs)

## Environment Variables

Create a `.env` file in the root directory and add the following variables:

```bash
# Database URL for Prisma
DATABASE_URL="postgresql://user:password@localhost:5432/dbname"

# NextAuth Configuration
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-nextauth-secret-string"

# Google OAuth Credentials
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
```

## Getting Started

1. **Install Dependencies**

```bash
npm install
# or
yarn install
# or
pnpm install
```

2. **Database Setup**

Run the Prisma migrations to initialize your database schema and generate the client.

```bash
npx prisma db push
# or if using migrations
npx prisma migrate dev
```

3. **Run the Development Server**

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the application.

## Usage

1. **Sign In:** Start by signing in with your Google account. You will need to grant access to Calendar, Tasks, and Google Drive for optimal syncing.
2. **Link More Accounts:** Use the settings in the sidebar to link secondary Google accounts to centralize your workflow.
3. **Voice Upload:** Click the "Upload Audio" button, record a quick voice memo or upload a file. The app will extract action items and synchronize them.
4. **Manual Entry:** Use the "Add" button to manually add Tasks, Events, or Notes to any linked Google account.

## Learn More

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Prisma Documentation](https://www.prisma.io/docs/) - learn how to use Prisma for database access.
- [NextAuth.js Documentation](https://next-auth.js.org/getting-started/introduction) - authentication configuration.