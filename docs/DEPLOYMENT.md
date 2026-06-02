# Deployment

1. Copy `.env.example` to `.env`.
2. Set `JWT_SECRET` to a long random value.
3. Add `OPENAI_API_KEY` if AI interpretation should work.
4. Run:

```bash
docker compose up --build
```

Open:

- Frontend: `http://localhost:5173`
- Backend API docs: `http://localhost:8000/docs`
- Health check: `http://localhost:8000/health`

For production, use managed PostgreSQL and Redis, HTTPS, a real secret manager, stricter CORS, and a deployed backend URL configured as `VITE_API_URL`.
