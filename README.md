# Vocabulary Explorer

Vocabulary Explorer is a mobile-first MVP prototype for the University of Alberta Language Technology Lab (ALTLab). It helps Plains Cree learners explore vocabulary by theme, meaning, and relation, while also giving expert users access to richer grammatical and morphological detail.

The project is built with:

- Next.js App Router
- TypeScript
- Tailwind CSS
- Prisma ORM
- PostgreSQL
- Docker + docker-compose
- Seed reset that prepares empty theme scaffolding for real vocabulary

## What’s Included

Public routes:

- `/`
- `/search`
- `/category/[slug]`
- `/word/[slug]`
- `/word/[slug]/map`
- `/saved`
- `/settings`

Admin routes:

- `/admin`
- `/admin/words`
- `/admin/words/new`
- `/admin/words/[id]/edit`
- `/admin/import`

Core MVP features:

- mobile-first browsing and search
- grounded AI answers for question-style search prompts
- novice / expert word detail modes
- local bookmarks via `localStorage`
- AI-generated flashcards from saved words
- AI lesson-plan generation by theme with PDF download
- AI category and relation enrichment after imports
- local settings for font size, Cree/English emphasis, and syllabics display
- simple semantic map view
- admin CRUD for words
- category manager
- JSON and CSV import flow
- Prisma schema and seed script
- Dockerfile + compose setup for Coolify/local deployment

## Proposed Folder Structure

```text
.
├── app
│   ├── admin
│   ├── api
│   ├── category/[slug]
│   ├── search
│   ├── settings
│   ├── saved
│   └── word/[slug]
├── components
│   ├── admin
│   ├── home
│   ├── navigation
│   ├── providers
│   ├── saved
│   ├── search
│   ├── settings
│   ├── ui
│   └── word
├── lib
├── prisma
│   ├── migrations
│   ├── schema.prisma
│   └── seed.ts
├── types
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

## Architecture

The app uses Next.js App Router for both public pages and admin pages. Public pages are mostly server-rendered and fetch data directly through Prisma-backed query helpers. Interactive concerns such as bookmarks, settings, and novice/expert toggles are handled in small client components.

The admin area is also built inside the App Router. CRUD and import actions submit to route handlers under `app/api/admin/*`, which validate payloads with Zod and persist data through shared Prisma service functions. Categories, meanings, morphology tables, and relations are normalized so real ALTLab lexical data can be added or imported without rewriting the UI.

## Prisma Schema

The schema lives in `prisma/schema.prisma`.

Main models:

- `Word`
- `WordMeaning`
- `MorphologyTable`
- `MorphologyEntry`
- `Relation`
- `Category`
- `WordCategory`
- `SavedWord`
- `MediaAsset`

Highlights:

- `Word` stores the main lexical entry and beginner/expert explanations.
- `WordMeaning` supports multiple glosses and descriptions.
- `MorphologyTable` and `MorphologyEntry` support paradigm-style expert data and plain-English learner labels.
- `Relation` connects words with relation types such as `synonym`, `broader`, `similar`, and `associated`.
- `Category` and `WordCategory` support theme browsing and reusable category management.

## Local Setup

1. Copy the environment template:

```bash
cp .env.example .env
```

2. Start PostgreSQL:

```bash
docker compose up -d db
```

3. Install dependencies:

```bash
npm install
```

4. Generate Prisma client and run migrations:

```bash
npx prisma generate
npx prisma migrate dev
```

5. Reset the catalog to empty theme scaffolding:

```bash
npm run db:seed
```

6. Start the app:

```bash
npm run dev
```

7. Open:

```text
http://localhost:3000
http://localhost:3000/admin
```

Admin unlock code defaults to the value in `.env`:

```text
ADMIN_ACCESS_CODE=altlab-admin
```

AI features also use these environment variables:

```text
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-5-mini
OPENAI_ENRICHMENT_MODEL=
OPENAI_LESSON_PLAN_MODEL=
OPENAI_FLASHCARD_MODEL=
OPENAI_SEARCH_MODEL=
```

## Exact Useful Commands

```bash
npm install
npx prisma generate
npx prisma migrate dev
npm run db:seed
npm run dev
```

Production-oriented commands:

```bash
npm run build
npm run start
npx prisma migrate deploy
```

## Docker and Compose

Bring up the full stack locally:

```bash
docker compose up --build
```

This will start:

- PostgreSQL on port `5432`
- Next.js app on port `3000`

## Coolify Deployment Steps

1. Push this repository to GitHub, GitLab, or another Git source connected to Coolify.
2. In Coolify, create a new project and add a new application from the repo.
3. Choose Dockerfile-based deployment.
   If the deployment logs mention `Nixpacks` or show repeated `COPY . /app` steps, the wrong builder is selected. Switch the application builder to Dockerfile before redeploying.
4. Set the port to `3000`.
5. Add or attach a PostgreSQL database service in Coolify.
6. Set these environment variables in the app service:

```text
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public
NEXT_PUBLIC_APP_URL=https://your-app-domain.example
ADMIN_ACCESS_CODE=choose-a-secret-admin-code
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-5-mini
OPENAI_SEARCH_MODEL=
PORT=3000
```

Replace `USER`, `PASSWORD`, `HOST`, and `DATABASE` with the real values from your Coolify PostgreSQL service.
If your logs show `HOST:5432`, the placeholder connection string is still being used.

7. Deploy the app.
8. After the database is reachable, run Prisma migrations:

```bash
npx prisma migrate deploy
```

9. Seed the starter theme scaffolding if you want the default categories loaded:

```bash
npm run db:seed
```

10. Visit the deployed app and unlock `/admin` with `ADMIN_ACCESS_CODE`.

Notes for Coolify:

- The Dockerfile already exposes port `3000`.
- The container startup command runs `prisma migrate deploy` before `next start`.
- `NEXT_PUBLIC_APP_URL` should match the public URL you assign in Coolify.

## Import Notes

The import page supports:

- JSON paste/import
- CSV upload/paste
- ITWÊWINA search-term import with follow-up AI enrichment

For CSV:

- use one row per word
- use JSON arrays inside cells for nested fields like `meanings`, `morphologyTables`, and `relations`
- or provide `categorySlugs` as a pipe-separated list such as `body-parts|animals`

An example JSON payload is prefilled on `/admin/import`.

After an import completes, the server can call OpenAI to:

- suggest missing category assignments across the current word catalog
- add high-confidence semantic relations without deleting existing human-entered links

If `OPENAI_API_KEY` is not configured, imports still succeed and the admin UI shows a warning that AI enrichment was skipped.

## Teacher And Study Features

- Theme pages now include a download action that generates an AI lesson plan and saves the PDF directly to the user's device.
- The saved words page now includes an AI flashcard generator for the learner's bookmarked words.
- The search page can answer question-style prompts by using OpenAI with local dictionary entries as grounding context.

## Seed Reset Notes

Running `npm run db:seed` now clears existing vocabulary content and recreates the default theme categories without adding any word entries.

Use the admin editor or import tools to load real vocabulary after the reset.
