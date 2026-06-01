# Biotech LinkedIn Posting Automation

This repository runs a GitHub Actions workflow every two hours. The workflow uses OpenAI to generate a high-dwell biotech LinkedIn post, publishes it through LinkedIn's Posts API, and stays active during the golden hour to reply to new comments.

## Content strategy

The automation is tuned for recruiters, founders, and biotech industry experts. It avoids generic biotech news and focuses on proof that the author can bridge biology, bioinformatics, AI, and practical software engineering.

It rotates through four content pillars:

| Pillar | What the post proves |
| --- | --- |
| Proof of Work Breakdown | Shows concrete engineering problem-solving from scripts, pipelines, apps, APIs, or deployment work. |
| Deep-Dive Carousel Concept | Frames a future PDF carousel or visual guide around AI-assisted biotech workflows. |
| Industrial Symbiosis and Circular Infrastructure | Connects compute infrastructure with biological systems, lab operations, environmental biotech, and circular systems. |
| Technical Critique and Case Study | Breaks down advanced data workflows from healthcare AI, performance telemetry, regional AI ecosystems, or real-time biological systems. |

Each post follows this structure:

1. A bold technical hook.
2. Short context explaining the biotech/software challenge.
3. 3 to 4 skimmable bullets with specific engineering choices or tradeoffs.
4. A practical takeaway.
5. A specific analytical question for comments.
6. 3 to 5 relevant hashtags.

## Reach rules built into the prompt

- No external URLs in the main post body.
- No repository links or "link in comments" language.
- Paragraphs stay short for skimming.
- Posts avoid unsupported clinical claims, fake statistics, and hype.
- Metrics are framed as estimates or targets unless directly supported.

## What it does

- Runs every 2 hours with GitHub Actions.
- Generates one professional biotech LinkedIn post.
- Publishes text-only posts to LinkedIn when the required secrets are configured.
- Keeps the workflow active for up to 60 minutes after posting.
- Checks for new comments every 10 minutes during that window.
- Replies once per comment with a short, substantive biotech/software response.
- Can be run manually from the GitHub Actions tab.

## Required GitHub secrets

Add these in GitHub under **Settings -> Secrets and variables -> Actions -> New repository secret**.

| Secret | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | OpenAI API key used to generate posts and replies. |
| `LINKEDIN_ACCESS_TOKEN` | LinkedIn OAuth access token with posting, comment, and comment-read permission. |
| `LINKEDIN_AUTHOR_URN` | LinkedIn author URN, such as `urn:li:person:YOUR_ID` or `urn:li:organization:YOUR_ORG_ID`. |

## Optional GitHub variables

Add these in **Settings -> Secrets and variables -> Actions -> Variables** if you want to customize behavior.

| Variable | Default | Purpose |
| --- | --- | --- |
| `OPENAI_MODEL` | `gpt-5` | Model used to generate posts and replies. |
| `LINKEDIN_VERSION` | `202605` | LinkedIn API version header. |
| `DRY_RUN` | `false` | Set to `true` to generate posts without publishing. |
| `ENABLE_COMMENT_REPLIES` | `true` | Set to `false` to publish without monitoring and replying. |
| `MONITOR_COMMENTS_MINUTES` | `60` | How long the workflow stays active after posting. |
| `COMMENT_CHECK_INTERVAL_SECONDS` | `600` | How often the workflow checks for comments. |
| `MAX_COMMENT_REPLIES_PER_RUN` | `8` | Maximum automatic replies per post run. |

## LinkedIn access requirements

LinkedIn's current Posts API uses `POST https://api.linkedin.com/rest/posts` for organic text posts. Your access token needs the correct LinkedIn posting permission for the author type you use:

- Personal profile posts: `w_member_social`.
- Organization/page posts: `w_organization_social`, and the LinkedIn member must have an eligible admin/content role for that page.

For comment replies, LinkedIn's comments API uses `POST https://api.linkedin.com/rest/socialActions/{postUrn}/comments`. Depending on your LinkedIn app access, the token may need social feed comment permission such as `w_member_social_feed` for personal comments or `w_organization_social_feed` for organization comments.

For comment monitoring, the workflow also has to read comments from the post. LinkedIn may require read/social feed permission for that app. If LinkedIn does not grant comment-read access, the workflow will still publish the post, then stop the reply monitor with a warning in the action log.

If a reply call fails, the script logs a warning and skips that comment. It does not retry the whole job, which avoids accidentally duplicating a published post.

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

PDF carousel generation is not automatic yet. The current workflow publishes text posts, but the Deep-Dive Carousel pillar is designed to test topics that can later become swipeable PDF documents.
