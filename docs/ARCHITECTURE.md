# Architecture

BioSentinel AI is split into three layers:

- `frontend/`: React + Vite + TypeScript user interface.
- `backend/`: FastAPI API, authentication, database models, bioinformatics services, report generation, and AI interpretation.
- `docker-compose.yml`: PostgreSQL, Redis, FastAPI backend, Celery worker, and frontend.

The OpenAI API key is read only by the backend from `OPENAI_API_KEY`. It is never sent to the frontend.

Long-running analysis is prepared for Celery/Redis. The current MVP completes core sequence analysis synchronously and records completed jobs in the database.
