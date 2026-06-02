from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class SequenceRequest(BaseModel):
    sequence: str = Field(min_length=1)
    sequence_type: str = "auto"
    title: str = "Untitled sequence"


class PrimerRequest(BaseModel):
    forward_primer: str = ""
    reverse_primer: str = ""


class MotifRequest(BaseModel):
    sequence: str
    motif: str = Field(min_length=1)


class AIInterpretRequest(BaseModel):
    analysis: dict
    question: str = Field(min_length=5, max_length=1200)


class JobResponse(BaseModel):
    id: int
    status: str
    task_type: str
    result: dict | None = None
    error: str | None = None


class ReportCreateRequest(BaseModel):
    title: str = "Sequence analysis report"
    analysis: dict
    ai_interpretation: str | None = None
