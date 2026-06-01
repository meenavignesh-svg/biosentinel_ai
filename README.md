# BioConsensus Lab

A fully client-side bioinformatics web app deployed with GitHub Pages. It performs practical sequence analysis in the browser and can optionally ask multiple AI reviewers to generate a consensus interpretation.

## Live Site

After GitHub Pages finishes deploying, the app will be available at:

```text
https://meenavignesh-svg.github.io/biosentinel_ai/
```

## What It Does Locally

The main analysis tools run directly in the browser and do not require an API key.

- Accepts FASTA or plain DNA, RNA, and protein sequences.
- Auto-detects sequence type, with manual override controls.
- Calculates length, nucleotide or amino-acid composition, and GC content.
- Generates reverse complement sequences for DNA and RNA.
- Transcribes DNA to RNA.
- Translates coding sequences with the standard codon table.
- Scans open reading frames across forward and reverse frames.
- Estimates protein molecular weight.
- Checks primers for length, GC percentage, rough melting temperature, and simple homopolymer risk.
- Creates a copyable analysis report.

## Optional AI Consensus Review

The app asks for an OpenAI API key before running any AI review. The key stays in browser session storage for the current browser session and is not saved in this repository.

Bioinformatics-focused reviewers include:

- Sequence Analyst
- Annotation Reviewer
- Wet Lab Planner
- Data QC
- Safety Reviewer

The AI review is designed to explain the local analysis, flag quality concerns, and suggest practical next steps. Local analysis still works without AI.

## Privacy

This is a static GitHub Pages app. There is no backend server in this repository.

Your API key is stored only in `sessionStorage` for the current browser session. When you run the AI review, requests are sent directly from your browser to the OpenAI API.

Do not use this on shared or untrusted computers.

## Deployment

The app deploys through GitHub Actions using GitHub Pages.

The deployment workflow is:

```text
.github/workflows/deploy-pages.yml
```

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Bioinformatics workbench interface. |
| `styles.css` | Responsive app styling and visual system. |
| `app.js` | Sequence analysis, primer checks, optional AI consensus, and visual motion. |
| `.github/workflows/deploy-pages.yml` | GitHub Pages deployment workflow. |

## Notes

Because GitHub Pages is static hosting, it cannot safely store server-side secrets. The app asks for the API key at runtime instead of using a repository secret.
