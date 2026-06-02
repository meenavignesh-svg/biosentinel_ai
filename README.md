# BioSentinel AI

BioSentinel AI is a full-stack bioinformatics SaaS MVP for research-use sequence analysis. It includes a React frontend, FastAPI backend, authentication, database storage, file uploads, report generation, Redis/Celery worker scaffolding, and backend-owned AI interpretation.

The OpenAI API key is never entered into the browser. AI works through the backend endpoint `/api/ai/interpret`.

## What Works

- User registration and login with JWT tokens.
- Password hashing with bcrypt.
- PostgreSQL database models for users, uploads, analysis jobs, sequence results, and reports.
- FASTA/plain sequence validation.
- DNA/RNA/protein detection.
- GC content, composition, reverse complement, transcription, translation, ORF scanning, motif search, restriction-site scanning, and primer QC.
- FASTA/text upload with file-size limits.
- Stored analysis jobs and JSON/HTML report generation.
- AI interpretation that only receives calculated backend results.
- Docker Compose setup for frontend, backend, PostgreSQL, Redis, and worker.
- Backend tests for core analysis and API behavior.

## Safety Boundaries

This app is for research and education use only.

It does not claim:

- Clinical diagnosis
- FDA/CE approval
- Medical accuracy
- Pathogen detection
- Organism identification
- Real BLAST integration
- A novel AI model

AI output must include uncertainty and `not for clinical use`.

## Run Locally

```bash
cp .env.example .env
docker compose up --build
```

Open:

- Frontend: `http://localhost:5173`
- Backend API docs: `http://localhost:8000/docs`
- Health check: `http://localhost:8000/health`

To enable AI, put your OpenAI key in `.env`:

```text
OPENAI_API_KEY=your_key_here
```

## Project Structure

```text
frontend/              React + Vite + TypeScript app
backend/               FastAPI app
backend/app/api/       API routes are currently mounted from app/main.py
backend/app/services/  Bioinformatics and AI services
backend/app/models/    SQLAlchemy database models
backend/app/jobs/      Celery worker entrypoint
backend/tests/         pytest tests
docs/                  API, architecture, limitations, deployment notes
docker-compose.yml     Full local stack
```

## Development Checks

Backend:

```bash
cd backend
pip install -r requirements.txt
pytest
```

Frontend:

```bash
cd frontend
npm install
npm run build
```

## Deployment Notes

GitHub Pages can only show the static root landing page. The working AI app needs the backend, database, and Redis services. Deploy the backend to a server platform, set `OPENAI_API_KEY` on that backend, then build the frontend with `VITE_API_URL` pointing at the backend URL.
