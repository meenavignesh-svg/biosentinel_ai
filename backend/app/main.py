from datetime import datetime, timezone
import json

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.config import get_settings
from app.core.database import Base, engine, get_db
from app.core.security import create_access_token, get_current_user, hash_password, verify_password
from app.models.analysis import AnalysisJob, Report, SequenceAnalysisResult, UploadedFile
from app.models.user import User
from app.schemas import (
    AIInterpretRequest,
    LoginRequest,
    MotifRequest,
    PrimerRequest,
    RegisterRequest,
    ReportCreateRequest,
    SequenceRequest,
    TokenResponse,
)
from app.services.ai import interpret_analysis
from app.services.bioinformatics import analyze_sequence, motif_search, primer_qc

settings = get_settings()
Base.metadata.create_all(bind=engine)

limiter = Limiter(key_func=get_remote_address)
app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="Research-use bioinformatics sequence analysis API. Not for clinical use.",
)
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RateLimitExceeded)
def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(status_code=429, content={"detail": "Too many requests. Please slow down and try again."})


@app.get("/health")
def health():
    return {"status": "ok", "service": settings.app_name, "environment": settings.environment}


@app.post("/api/auth/register", response_model=TokenResponse)
@limiter.limit("10/minute")
def register(request: Request, payload: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email.lower()).first()
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    user = User(email=payload.email.lower(), password_hash=hash_password(payload.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return TokenResponse(access_token=create_access_token(str(user.id)))


@app.post("/api/auth/login", response_model=TokenResponse)
@limiter.limit("20/minute")
def login(request: Request, payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email.lower()).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Email or password is incorrect.")
    return TokenResponse(access_token=create_access_token(str(user.id)))


@app.get("/api/me")
def me(user: User = Depends(get_current_user)):
    return {"id": user.id, "email": user.email}


@app.post("/api/analyze/sequence")
@limiter.limit("30/minute")
def analyze(
    request: Request,
    payload: SequenceRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    result = analyze_sequence(payload.sequence, payload.sequence_type, payload.title, settings.max_sequence_length)
    job = AnalysisJob(
        user_id=user.id,
        status="completed",
        task_type="sequence",
        result=result,
        completed_at=datetime.now(timezone.utc),
    )
    db.add(job)
    db.flush()
    db.add(SequenceAnalysisResult(user_id=user.id, job_id=job.id, result=result))
    db.commit()
    return {"job_id": job.id, "result": result}


@app.post("/api/analyze/orfs")
def analyze_orfs(payload: SequenceRequest, user: User = Depends(get_current_user)):
    result = analyze_sequence(payload.sequence, payload.sequence_type, payload.title, settings.max_sequence_length)
    return {"orfs": result.get("orfs", []), "limitations": result["limitations"]}


@app.post("/api/analyze/primers")
def analyze_primers(payload: PrimerRequest, user: User = Depends(get_current_user)):
    return {
        "forward": primer_qc(payload.forward_primer),
        "reverse": primer_qc(payload.reverse_primer),
        "limitations": ["Primer QC is a screening aid only. Confirm with a validated primer-design workflow."],
    }


@app.post("/api/analyze/motif")
def analyze_motif(payload: MotifRequest, user: User = Depends(get_current_user)):
    return motif_search(payload.sequence, payload.motif)


@app.post("/api/files/upload")
async def upload_file(file: UploadFile = File(...), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if file.content_type not in {"text/plain", "application/octet-stream", "chemical/seq-na-fasta"}:
        raise HTTPException(status_code=415, detail="Upload a plain text FASTA or sequence file.")
    content = await file.read(settings.max_upload_bytes + 1)
    if len(content) > settings.max_upload_bytes:
        raise HTTPException(status_code=413, detail=f"File is too large. Limit is {settings.max_upload_bytes // 1_000_000} MB.")
    text = content.decode("utf-8", errors="replace")
    result = analyze_sequence(text, "auto", file.filename, settings.max_sequence_length)
    uploaded = UploadedFile(user_id=user.id, filename=file.filename, content_type=file.content_type or "text/plain", sequence=text)
    db.add(uploaded)
    db.commit()
    return {"file_id": uploaded.id, "analysis": result}


@app.get("/api/jobs/{job_id}")
def get_job(job_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    job = db.get(AnalysisJob, job_id)
    if not job or job.user_id != user.id:
        raise HTTPException(status_code=404, detail="Job not found.")
    return {"id": job.id, "status": job.status, "task_type": job.task_type, "result": job.result, "error": job.error}


@app.post("/api/reports")
def create_report(payload: ReportCreateRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    body = {
        "title": payload.title,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "analysis": payload.analysis,
        "ai_interpretation": payload.ai_interpretation,
        "limitations": [
            "Research and education use only.",
            "Not for clinical use.",
            "No diagnostic, regulatory, or organism-identification claims are made.",
        ],
    }
    report = Report(user_id=user.id, title=payload.title, format="json", body=json.dumps(body, indent=2))
    db.add(report)
    db.commit()
    db.refresh(report)
    return {"report_id": report.id, "report": body}


@app.get("/api/reports/{report_id}")
def get_report(report_id: int, format: str = "json", user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    report = db.get(Report, report_id)
    if not report or report.user_id != user.id:
        raise HTTPException(status_code=404, detail="Report not found.")
    if format == "html":
        data = json.loads(report.body)
        html = f"""
        <html><body>
        <h1>{data["title"]}</h1>
        <p><strong>Created:</strong> {data["created_at"]}</p>
        <h2>Limitations</h2><ul>{''.join(f'<li>{item}</li>' for item in data["limitations"])}</ul>
        <h2>Results</h2><pre>{json.dumps(data["analysis"], indent=2)}</pre>
        <h2>AI Interpretation</h2><p>{data.get("ai_interpretation") or "Not requested."}</p>
        </body></html>
        """
        return Response(content=html, media_type="text/html")
    return json.loads(report.body)


@app.post("/api/ai/interpret")
@limiter.limit("10/minute")
def ai_interpret(
    request: Request,
    payload: AIInterpretRequest,
    user: User = Depends(get_current_user),
):
    interpretation = interpret_analysis(payload.analysis, payload.question)
    return {
        "interpretation": interpretation,
        "limitations": [
            "AI only interpreted calculated results supplied by the app.",
            "Not for clinical use.",
        ],
    }
