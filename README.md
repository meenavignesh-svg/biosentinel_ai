# Biostars Draft Generator

This repository generates Biostars-ready bioinformatics forum post drafts from one or more GitHub repositories. It does **not** auto-post to Biostars. The workflow creates a Markdown draft and uploads it as a GitHub Actions artifact for manual review.

## Why Draft Only

Biostars is a technical Q&A community, not a social feed. Automated posting can be spammy and may violate community expectations if done without explicit permission. This workflow keeps things safe by generating careful drafts that you review and post yourself.

## What It Does

- Runs once per day at 03:30 UTC.
- Can also be run manually from the GitHub Actions tab.
- Reads repository metadata, README content, recent commits, and open issues.
- Supports one or more source repositories.
- Generates a humanized, technical Biostars-style draft.
- Adds suggested tags.
- Adds a Biostars manual publish link with prefilled tags.
- Uploads the draft as a GitHub Actions artifact.
- Uploads a failure report if something breaks.

## Required GitHub Secret

Add this in **Settings -> Secrets and variables -> Actions -> New repository secret**.

| Secret | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | OpenAI API key used to generate the Biostars draft. |

## Optional GitHub Variables

Add these in **Settings -> Secrets and variables -> Actions -> Variables**.

| Variable | Default | Purpose |
| --- | --- | --- |
| `SOURCE_REPOSITORIES` | `meenavignesh-svg/daily_biotech_based_linkedin_post` | Comma-separated repositories to use as source context. Example: `owner/repo-one,owner/repo-two`. |
| `OPENAI_MODEL` | `gpt-5` | Model used to generate the draft. |
| `REQUEST_RETRY_ATTEMPTS` | `3` | Number of retry attempts for temporary API/network failures. |
| `REQUEST_RETRY_DELAY_MS` | `2000` | Base retry delay in milliseconds. |
| `MAX_OUTPUT_TOKENS` | `1600` | Maximum length budget for the generated draft. |

## Connecting Two Repositories

Set the `SOURCE_REPOSITORIES` variable to both repositories, separated by a comma:

```text
owner/first-repo,owner/second-repo
```

The workflow will use both repositories as context when drafting the Biostars post.

## Draft Format

Each artifact contains a Markdown draft with:

- Title
- Suggested tags
- Draft post body
- Why it fits Biostars
- Manual publish link
- Safety note

## Manual Posting

1. Open the latest **Actions** run.
2. Download the `biostars-draft` artifact.
3. Read and edit the Markdown draft.
4. Open the included Biostars publish link.
5. Paste the reviewed draft into Biostars manually.

## Content Rules

The generator is tuned for:

- Bioinformatics only.
- Humanized, honest, technical writing.
- Practical questions or reproducible workflow discussions.
- No hype.
- No medical advice.
- No fake benchmarks.
- No promotional announcements disguised as questions.

If the repository context is weak, the workflow should frame the draft as a careful question rather than an announcement.
