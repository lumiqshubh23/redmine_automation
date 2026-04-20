# redmine_automation

## React + Backend Structure

Project now has separate folders:

- `redmine-logger/backend` -> Express backend
- `redmine-logger/frontend` -> React (Vite) frontend

## Run Backend

1. Open terminal in `redmine-logger`.
2. Run `npm install --prefix backend`.
3. Run `npm run backend`.
4. Backend runs at `http://localhost:3000`.

## Run Frontend

1. Open terminal in `redmine-logger`.
2. Run `npm install --prefix frontend`.
3. (Optional) copy `frontend/.env.example` to `frontend/.env` and update API URL.
4. Run `npm run frontend`.
5. Open `http://localhost:5173`.

## Features in UI

In frontend UI, enter:

- Owner, Repository, GitHub Username (user id)
- Optional token, branch
- Date range (`fromDate` defaults from 1st of month to today)
- Excel path (default `input.xlsx`)

Then:

- Click `Import GitHub Commits`
- Use `Add Task` to add manual rows
- Click `Save to Excel`

## Generate timelog and upload

These are available directly in backend + frontend:

- `Generate Excel` button -> calls `POST /api/excel/generate` and creates `timelog.xlsx`
- `Upload to Redmine` button -> calls `POST /api/redmine/upload`

Set Redmine API key in UI field or in API environment variable:

- `REDMINE_API_KEY=your_key npm run backend`