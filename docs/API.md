# API

Base URL for local development: `http://localhost:8000`

All analysis, file, report, and AI endpoints require a bearer token from `/api/auth/register` or `/api/auth/login`.

## Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/me`

## Analysis

- `POST /api/analyze/sequence`
- `POST /api/analyze/orfs`
- `POST /api/analyze/primers`
- `POST /api/analyze/motif`

## Files, Jobs, Reports

- `POST /api/files/upload`
- `GET /api/jobs/{job_id}`
- `POST /api/reports`
- `GET /api/reports/{report_id}`

## AI

- `POST /api/ai/interpret`

The AI endpoint only receives calculated analysis JSON and the user's question. It must not invent gene names, organisms, diseases, functions, or clinical claims.
