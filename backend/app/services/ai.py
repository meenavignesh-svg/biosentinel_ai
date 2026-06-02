from openai import OpenAI

from app.core.config import get_settings


SYSTEM_PROMPT = """You are a careful bioinformatics interpretation assistant.
Only interpret the calculated analysis JSON provided by the application.
Do not invent gene names, organisms, diseases, pathogenicity, clinical meaning, or functions.
Always include uncertainty, practical validation steps, and the phrase 'not for clinical use'.
Keep the answer concise and useful to a bioinformatics learner."""


def interpret_analysis(analysis: dict, question: str) -> str:
    settings = get_settings()
    if not settings.openai_api_key:
        return (
            "AI interpretation is not configured on the backend. Add OPENAI_API_KEY to the backend environment. "
            "The local bioinformatics analysis still works without AI."
        )
    client = OpenAI(api_key=settings.openai_api_key)
    response = client.responses.create(
        model=settings.openai_model,
        input=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    "Question:\n"
                    f"{question}\n\nCalculated analysis JSON:\n{analysis}\n\n"
                    "Return: summary, quality flags, next validation steps, limitations."
                ),
            },
        ],
        temperature=0.2,
    )
    return response.output_text
