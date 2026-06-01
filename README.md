# Biotech LinkedIn Posting Automation

This repository runs a GitHub Actions workflow every two hours. The workflow uses OpenAI to generate a biotech-focused LinkedIn post, then publishes it through LinkedIn's Posts API.

## What it does

- Runs every 2 hours with GitHub Actions.
- Generates one professional biotech LinkedIn post.
- Focuses on AI in biotech, drug discovery, genomics, diagnostics, lab automation, clinical trials, synthetic biology, bioinformatics, and biotech operations.
- Publishes text-only posts to LinkedIn when the required secrets are configured.
- Can be run manually from the GitHub Actions tab.

## Required GitHub secrets

Add these in GitHub under **Settings -> Secrets and variables -> Actions -> New repository secret**.

| Secret | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | OpenAI API key used to generate the post. |
| `LINKEDIN_ACCESS_TOKEN` | LinkedIn OAuth access token with posting permission. |
| `LINKEDIN_AUTHOR_URN` | LinkedIn author URN, such as `urn:li:person:YOUR_ID` or `urn:li:organization:YOUR_ORG_ID`. |

## Optional GitHub variables

Add these in **Settings -> Secrets and variables -> Actions -> Variables** if you want to customize behavior.

| Variable | Default | Purpose |
| --- | --- | --- |
| `OPENAI_MODEL` | `gpt-5` | Model used to generate posts. |
| `LINKEDIN_VERSION` | `202605` | LinkedIn API version header. |
| `DRY_RUN` | `false` | Set to `true` to generate posts without publishing. |

## LinkedIn access requirements

LinkedIn's current Posts API uses `POST https://api.linkedin.com/rest/posts` for organic text posts. Your access token needs the correct LinkedIn posting permission for the author type you use:

- Personal profile posts: `w_member_social`.
- Organization/page posts: `w_organization_social`, and the LinkedIn member must have an eligible admin/content role for that page.

## Manual test

1. Add the required secrets.
2. Set `DRY_RUN` to `true` first if you want to test without publishing.
3. Open the **Actions** tab.
4. Select **Post biotech updates to LinkedIn**.
5. Click **Run workflow**.
6. Review the action log.
7. Set `DRY_RUN` to `false` when you are ready to publish automatically.

## Notes

Posting every two hours can be aggressive for LinkedIn. Keep an eye on engagement and platform limits, and consider reducing frequency if posts feel repetitive or receive low engagement.
