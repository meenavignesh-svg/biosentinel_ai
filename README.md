# Biotech LinkedIn Posting Automation

This repository runs a GitHub Actions workflow every two hours. The workflow gathers fresh biotech news, uses OpenAI to create a humanized biotech LinkedIn post, generates a matching biotech visual, publishes the post with the image through LinkedIn, and stays active to reply to new comments until the next scheduled run is close to starting.

## Content strategy

The automation is biotech-only and humanized-only. It should not post general AI, general tech, finance, lifestyle, or generic news unless the angle is directly tied to biotech.

The writing must feel like a thoughtful biotech operator wrote it:

- No robotic summaries.
- No generic press-release tone.
- No copied headlines.
- No fake certainty.
- No unsupported clinical claims.
- No filler phrases like "in today's rapidly evolving landscape".
- Specific biotech judgment, practical tradeoffs, and human phrasing only.

Each post is optimized for credible reach toward recruiters, founders, researchers, and industry experts. It cannot guarantee 100k reach, but it is designed to improve the odds with:

- Fresh biotech news context.
- Humanized expert analysis instead of headline summaries.
- A strong first-line hook.
- Short, skimmable paragraphs.
- 3 to 4 practical bullets about biotech data, AI, bioinformatics, lab automation, drug discovery, genomics, diagnostics, or clinical operations.
- A specific analytical question that invites comments.
- A generated biotech image on every post.
- Near-continuous comment monitoring between scheduled runs.

## Image strategy

Every published post includes an AI-generated biotech visual. The image prompt is constrained to biotech concepts such as genomics, AI drug discovery, diagnostics, lab automation, molecular data, clinical data systems, and computational biology.

The image style is professional and editorial:

- Dark background.
- Emerald/cyan scientific accents.
- Abstract lab/data visuals.
- No logos.
- No fake brands.
- No patient imagery.
- No unsupported medical claims.
- Minimal or no text inside the image.

## What it does

- Runs every 2 hours with GitHub Actions.
- Pulls recent biotech news from RSS/news feeds.
- Generates one humanized biotech-only LinkedIn post.
- Generates one matching biotech image.
- Uploads the image through LinkedIn's Images API.
- Publishes the post through LinkedIn's Posts API.
- Keeps the workflow active for up to 115 minutes after posting.
- Checks for new comments every 5 minutes during that window.
- Replies once per comment with a short, substantive biotech response.
- Starts again on the next 2-hour schedule, creating near-continuous coverage.
- Can be run manually from the GitHub Actions tab.

## 24/7 behavior

GitHub Actions is not a permanent always-on server. A single workflow run cannot stay alive forever. This setup gets close inside GitHub Actions by running every 2 hours and keeping each run active for up to 115 minutes.

For true 24/7 engagement with no gaps, move the same script to an always-on worker such as a small VPS, Render background worker, Railway service, Fly.io machine, or AWS/GCP/Azure container. The current GitHub version is designed as the best low-maintenance option inside a repository.

## Required GitHub secrets

Add these in GitHub under **Settings -> Secrets and variables -> Actions -> New repository secret**.

| Secret | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | OpenAI API key used to generate posts, images, and replies. |
| `LINKEDIN_ACCESS_TOKEN` | LinkedIn OAuth access token with posting, image upload, comment, and comment-read permission. |
| `LINKEDIN_AUTHOR_URN` | LinkedIn author URN, such as `urn:li:person:YOUR_ID` or `urn:li:organization:YOUR_ORG_ID`. |

## Optional GitHub variables

Add these in **Settings -> Secrets and variables -> Actions -> Variables** if you want to customize behavior.

| Variable | Default | Purpose |
| --- | --- | --- |
| `OPENAI_MODEL` | `gpt-5` | Model used to generate posts and replies. |
| `OPENAI_IMAGE_MODEL` | `gpt-image-1` | Model used to generate post images. |
| `OPENAI_IMAGE_SIZE` | `1536x1024` | Image size used for LinkedIn visuals. |
| `OPENAI_IMAGE_QUALITY` | `medium` | Image generation quality. |
| `LINKEDIN_VERSION` | `202605` | LinkedIn API version header. |
| `NEWS_FEEDS` | built-in biotech feeds | Comma-separated RSS feed URLs. |
| `NEWS_ITEMS_LIMIT` | `8` | Number of news items passed into the post prompt. |
| `DRY_RUN` | `false` | Set to `true` to generate posts/images without publishing. |
| `ENABLE_COMMENT_REPLIES` | `true` | Set to `false` to publish without monitoring and replying. |
| `MONITOR_COMMENTS_MINUTES` | `115` | How long the workflow stays active after posting. |
| `COMMENT_CHECK_INTERVAL_SECONDS` | `300` | How often the workflow checks for comments. |
| `MAX_COMMENT_REPLIES_PER_RUN` | `20` | Maximum automatic replies per post run. |

## LinkedIn access requirements

LinkedIn's Images API initializes an upload, returns an upload URL plus an image URN, and the Posts API references that image URN in the post content.

Your access token needs the correct LinkedIn permissions for the author type you use:

- Personal profile posts/images: `w_member_social`.
- Organization/page posts/images: `w_organization_social`, and the LinkedIn member must have an eligible admin/content role for that page.

For comment replies, LinkedIn's comments API uses `POST https://api.linkedin.com/rest/socialActions/{postUrn}/comments`. Depending on your LinkedIn app access, the token may need social feed comment permission such as `w_member_social_feed` for personal comments or `w_organization_social_feed` for organization comments.

For comment monitoring, the workflow also has to read comments from the post. If LinkedIn does not grant comment-read access, the workflow will still publish the post with its image, then stop the reply monitor with a warning in the action log.

## Manual test

1. Add the required secrets.
2. Set `DRY_RUN` to `true` first if you want to test without publishing.
3. Open the **Actions** tab.
4. Select **Post biotech updates to LinkedIn**.
5. Click **Run workflow**.
6. Review the action log.
7. Set `DRY_RUN` to `false` when you are ready to publish automatically.

## Notes

Posting every two hours can be aggressive for LinkedIn. Keep an eye on engagement and platform limits, and reduce frequency if posts feel repetitive or receive low engagement.

100k reach depends on network quality, topic timing, comments, reposts, and LinkedIn distribution. This automation improves the content mechanics, but it should not be used for spam, fake engagement, or mass unsolicited interaction.
