# BioSentinel AI

BioSentinel AI is a zero-key desktop bioinformatics workbench for research-use sequence analysis. The public app runs fully in the browser: no login, no OpenAI key, no external AI API, and no backend required for the main experience.

Live app:

```text
https://meenavignesh-svg.github.io/biosentinel_ai/
```

## What Works In The Live App

- FASTA/plain sequence input.
- DNA/RNA/protein detection.
- GC content, composition, reverse complement, transcription, translation, ORF scanning, restriction-site screening, and primer QC.
- Rules-based bioinformatics interpretation with explicit uncertainty and limitations.
- JSON report download and clipboard export.
- Desktop-first interface with tabbed results and high-density panels.

## No API Required

The live app does not require:

- OpenAI API key
- Vercel secrets
- Backend server
- User account
- Database

The interpretation panel is intentionally rules-based. It does not pretend to be a trained biological model.

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

All interpretation must include uncertainty and `not for clinical use`.

## Local Development

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Build:

```bash
cd frontend
npm run build
```

## Optional Full-Stack Backend

The repository still includes the earlier FastAPI backend for future authenticated SaaS development, but the public GitHub Pages app does not depend on it.

Backend checks:

```bash
cd backend
pip install -r requirements.txt
pytest
```

## Deployment

GitHub Actions builds `frontend/` and deploys `frontend/dist` to GitHub Pages.
