# Multi-AI Consensus Engine

A static GitHub Pages app that asks for an OpenAI API key before doing any work, then runs multiple specialist agents and synthesizes a practical consensus answer.

## What It Does

- Runs entirely in the browser on GitHub Pages.
- Asks for an API key before any model call.
- Keeps the API key in browser session storage only.
- Runs multiple independent agents:
  - Builder
  - Skeptic
  - Evidence Analyst
  - Risk Reviewer
  - Operator
- Synthesizes the agent outputs into one consensus answer.
- Shows agreement, disagreement, risks, confidence, and next action.
- Includes a copy button for the final consensus.

## Live Site

After GitHub Pages finishes deploying, the app will be available at:

```text
https://meenavignesh-svg.github.io/daily_biotech_based_linkedin_post/
```

## How To Use

1. Open the live GitHub Pages site.
2. Click **Connect API**.
3. Paste your OpenAI API key.
4. Enter a question or task.
5. Choose a model and depth.
6. Select at least two agents.
7. Click **Run consensus**.

## Privacy Note

This is a static client-side app. There is no backend server in this repository.

Your API key is stored only in `sessionStorage` for the current browser session. It is sent directly from your browser to the OpenAI API when you run the engine.

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
| `index.html` | App structure. |
| `styles.css` | Responsive interface styling. |
| `app.js` | API key gate, agent calls, consensus synthesis, and canvas visual. |
| `.github/workflows/deploy-pages.yml` | GitHub Pages deployment workflow. |

## Notes

Because GitHub Pages is static hosting, it cannot safely store server-side secrets. The app asks for the API key at runtime instead of using a repository secret.
