const REQUIRED = ["OPENAI_API_KEY", "LINKEDIN_ACCESS_TOKEN", "LINKEDIN_AUTHOR_URN"];

const DEFAULT_NEWS_FEEDS = [
  "https://news.google.com/rss/search?q=biotech+OR+biotechnology+OR+bioinformatics+OR+genomics+OR+drug+discovery+when:1d&hl=en-US&gl=US&ceid=US:en",
  "https://news.google.com/rss/search?q=AI+biotech+OR+AI+drug+discovery+OR+computational+biology+when:1d&hl=en-US&gl=US&ceid=US:en",
  "https://www.fiercebiotech.com/rss/xml",
  "https://www.genengnews.com/feed/"
];

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function optionalInt(name, fallback) {
  const value = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function linkedInHeaders(contentType = "application/json") {
  const headers = {
    "Authorization": `Bearer ${requireEnv("LINKEDIN_ACCESS_TOKEN")}`,
    "Linkedin-Version": process.env.LINKEDIN_VERSION || "202605",
    "X-Restli-Protocol-Version": "2.0.0"
  };
  if (contentType) headers["Content-Type"] = contentType;
  return headers;
}

function stripCdata(value) {
  return value.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();
}

function decodeEntities(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function tagValue(item, tagName) {
  const match = item.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match ? decodeEntities(stripCdata(match[1]).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")) : "";
}

function parseRssItems(xml, feedUrl) {
  return [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((match) => ({
    title: tagValue(match[0], "title"),
    source: tagValue(match[0], "source") || new URL(feedUrl).hostname,
    pubDate: tagValue(match[0], "pubDate"),
    description: tagValue(match[0], "description")
  })).filter((item) => item.title);
}

function getNewsFeedUrls() {
  const configured = process.env.NEWS_FEEDS || "";
  return configured
    ? configured.split(",").map((url) => url.trim()).filter(Boolean)
    : DEFAULT_NEWS_FEEDS;
}

async function fetchBiotechNews() {
  const maxItems = optionalInt("NEWS_ITEMS_LIMIT", 8);
  const feeds = getNewsFeedUrls();
  const items = [];

  for (const feed of feeds) {
    try {
      const response = await fetch(feed, { headers: { "User-Agent": "biotech-linkedin-automation/1.0" } });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      items.push(...parseRssItems(await response.text(), feed));
    } catch (error) {
      console.warn(`News feed skipped (${feed}): ${error.message}`);
    }
  }

  const seen = new Set();
  return items.filter((item) => {
    const key = item.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, maxItems);
}

function formatNewsContext(newsItems) {
  if (!newsItems.length) {
    return "No fresh RSS items were available. Write a timeless biotech analysis post instead, and do not pretend there is breaking news.";
  }

  return newsItems.map((item, index) => {
    const date = item.pubDate ? ` | ${item.pubDate}` : "";
    const description = item.description ? ` | ${item.description.slice(0, 220)}` : "";
    return `${index + 1}. ${item.title} (${item.source}${date})${description}`;
  }).join("\n");
}

function extractOutputText(response) {
  if (response.output_text) return response.output_text.trim();

  const chunks = [];
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) chunks.push(content.text);
    }
  }
  return chunks.join("\n").trim();
}

async function callOpenAI(input, maxOutputTokens = 650) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${requireEnv("OPENAI_API_KEY")}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5",
      input,
      max_output_tokens: maxOutputTokens
    })
  });

  if (!response.ok) throw new Error(`OpenAI request failed: ${response.status} ${await response.text()}`);
  return extractOutputText(await response.json());
}

async function generateBiotechImage(postText, newsContext) {
  const prompt = `Create a professional LinkedIn image for a biotech news analysis post.\n\nPost:\n${postText}\n\nNews context:\n${newsContext}\n\nVisual direction:\n- Biotech only: genomics, AI drug discovery, lab automation, diagnostics, bioinformatics, molecular data, clinical data systems, or computational biology.\n- Humanized, credible, and expert-facing; not generic stock art.\n- Dark editorial background with high-contrast emerald/cyan scientific accents.\n- Use abstract lab/data visuals, molecular structures, sequencing traces, dashboards, or researcher-workflow cues.\n- No company logos, no fake brands, no patient imagery, no medical claims.\n- Minimal or no text in the image. If text appears, keep it short and readable.\n- 16:9 composition suitable for LinkedIn.`;

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${requireEnv("OPENAI_API_KEY")}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
      prompt,
      size: process.env.OPENAI_IMAGE_SIZE || "1536x1024",
      quality: process.env.OPENAI_IMAGE_QUALITY || "medium",
      output_format: "png"
    })
  });

  if (!response.ok) throw new Error(`OpenAI image request failed: ${response.status} ${await response.text()}`);

  const data = await response.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI returned no image data.");
  return Buffer.from(b64, "base64");
}

async function uploadImageToLinkedIn(imageBuffer) {
  const author = requireEnv("LINKEDIN_AUTHOR_URN");
  const initResponse = await fetch("https://api.linkedin.com/rest/images?action=initializeUpload", {
    method: "POST",
    headers: linkedInHeaders(),
    body: JSON.stringify({ initializeUploadRequest: { owner: author } })
  });

  if (!initResponse.ok) throw new Error(`LinkedIn image upload init failed: ${initResponse.status} ${await initResponse.text()}`);

  const initData = await initResponse.json();
  const uploadUrl = initData?.value?.uploadUrl;
  const imageUrn = initData?.value?.image;
  if (!uploadUrl || !imageUrn) throw new Error("LinkedIn did not return an upload URL and image URN.");

  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "image/png" },
    body: imageBuffer
  });

  if (!uploadResponse.ok) throw new Error(`LinkedIn image upload failed: ${uploadResponse.status} ${await uploadResponse.text()}`);
  return imageUrn;
}

function createAltText(postText) {
  const firstLine = postText.split("\n").map((line) => line.trim()).find(Boolean) || "Biotech news analysis";
  return `Biotech news analysis visual: ${firstLine}`.slice(0, 250);
}

async function createBiotechPost() {
  const newsItems = await fetchBiotechNews();
  const newsContext = formatNewsContext(newsItems);

  const prompt = `Write one humanized LinkedIn post based only on current biotech news for recruiters, founders, and biotech industry experts.\n\nAudience:\n- Biotech founders, recruiters, researchers, bioinformatics teams, AI drug discovery builders, diagnostics operators, genomics teams, and technical industry experts.\n\nGoal:\n- Optimize for credible reach toward a large professional audience by making the post useful, specific, visually compatible, and comment-worthy. Do not promise viral reach.\n\nRecent biotech news candidates:\n${newsContext}\n\nChoose one biotech news angle and interpret it like a thoughtful human operator, not a news bot. Explain why it matters, what technical bottleneck or opportunity sits underneath it, and what biotech builders should pay attention to.\n\nPost blueprint:\n1. Hook: one sharp human observation or tension from the biotech news.\n2. Context: summarize the biotech news angle in plain English without copying headlines.\n3. Core value: 3 to 4 skimmable bullets with practical implications for biotech data, AI, bioinformatics, clinical operations, lab automation, drug discovery, genomics, or diagnostics.\n4. Takeaway: one sentence on what this means for biotech builders or teams.\n5. Interaction prompt: ask a specific analytical biotech question that invites expert comments.\n\nHard rules:\n- 1,100 characters or less.\n- Biotech only. No general tech, finance, politics, sports, lifestyle, or generic AI content unless directly tied to biotech.\n- No external URLs.\n- Do not mention a repository link, GitHub link, comments link, or link in comments.\n- Do not copy article headlines verbatim.\n- Do not sound automated, corporate, generic, or like a press release.\n- Use first-person judgment lightly if it makes the post feel more human.\n- Keep paragraphs to 1 or 2 lines.\n- Avoid medical advice, unsupported clinical claims, hype, and fake statistics.\n- If using a metric, make it a clearly framed estimate or engineering target unless it is directly supported by the news context.\n- End with 3 to 5 biotech-relevant hashtags.\n- Do not mention that an AI wrote it.\n- Return only the LinkedIn post text.`;

  const text = await callOpenAI(prompt, 650);
  if (!text) throw new Error("OpenAI returned an empty post.");
  return { text, newsContext };
}

async function publishToLinkedIn(commentary, imageUrn, altText) {
  const author = requireEnv("LINKEDIN_AUTHOR_URN");

  const response = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: linkedInHeaders(),
    body: JSON.stringify({
      author,
      commentary,
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: []
      },
      content: {
        media: {
          id: imageUrn,
          altText
        }
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false
    })
  });

  if (!response.ok) throw new Error(`LinkedIn post failed: ${response.status} ${await response.text()}`);
  return response.headers.get("x-restli-id") || "published";
}

async function createLinkedInComment(postUrn, text, parentCommentUrn = null) {
  const author = requireEnv("LINKEDIN_AUTHOR_URN");
  const encodedPostUrn = encodeURIComponent(postUrn);
  const body = { actor: author, object: postUrn, message: { text } };
  if (parentCommentUrn) body.parentComment = parentCommentUrn;

  const response = await fetch(`https://api.linkedin.com/rest/socialActions/${encodedPostUrn}/comments`, {
    method: "POST",
    headers: linkedInHeaders(),
    body: JSON.stringify(body)
  });

  if (!response.ok) throw new Error(`LinkedIn comment failed: ${response.status} ${await response.text()}`);
}

async function fetchTopLevelComments(postUrn) {
  const encodedPostUrn = encodeURIComponent(postUrn);
  const response = await fetch(`https://api.linkedin.com/rest/socialActions/${encodedPostUrn}/comments`, {
    method: "GET",
    headers: linkedInHeaders()
  });

  if (!response.ok) throw new Error(`LinkedIn comment read failed: ${response.status} ${await response.text()}`);
  const data = await response.json();
  return Array.isArray(data.elements) ? data.elements : [];
}

function shouldReplyToComment(comment, repliedCommentIds) {
  const author = requireEnv("LINKEDIN_AUTHOR_URN");
  const text = comment?.message?.text || "";
  const id = comment?.id || comment?.commentUrn;
  if (!id || repliedCommentIds.has(id)) return false;
  if (comment.actor === author) return false;
  return Boolean(text.trim());
}

async function createReply(postText, commentText) {
  const prompt = `Write a thoughtful LinkedIn reply to this comment on a biotech news analysis post.\n\nOriginal post:\n${postText}\n\nComment to reply to:\n${commentText}\n\nReply requirements:\n- 450 characters or less.\n- Biotech only.\n- Sound human, practical, and informed.\n- Add substance: a tradeoff, implementation detail, question, or biotech data/AI angle.\n- Be warm and professional.\n- Do not use hashtags.\n- Do not include links.\n- Do not claim clinical outcomes or invent statistics.\n- Return only the reply text.`;

  const reply = await callOpenAI(prompt, 300);
  if (!reply) throw new Error("OpenAI returned an empty reply.");
  return reply;
}

async function monitorAndReplyToComments(postUrn, postText) {
  if (process.env.ENABLE_COMMENT_REPLIES === "false") return;
  if (!postUrn || postUrn === "published") {
    console.warn("LinkedIn did not return a post URN, so comment monitoring was skipped.");
    return;
  }

  const monitorMinutes = optionalInt("MONITOR_COMMENTS_MINUTES", 60);
  const intervalSeconds = optionalInt("COMMENT_CHECK_INTERVAL_SECONDS", 600);
  const maxReplies = optionalInt("MAX_COMMENT_REPLIES_PER_RUN", 8);
  if (monitorMinutes === 0 || intervalSeconds === 0 || maxReplies === 0) return;

  const repliedCommentIds = new Set();
  const deadline = Date.now() + monitorMinutes * 60 * 1000;
  let replyCount = 0;

  console.log(`Monitoring LinkedIn comments for ${monitorMinutes} minute(s).`);

  while (Date.now() < deadline && replyCount < maxReplies) {
    let comments;
    try {
      comments = await fetchTopLevelComments(postUrn);
    } catch (error) {
      console.warn(error.message);
      console.warn("Comment monitoring stopped. Check LinkedIn read/comment permissions if replies should be automatic.");
      return;
    }

    for (const comment of comments) {
      if (replyCount >= maxReplies) break;
      if (!shouldReplyToComment(comment, repliedCommentIds)) continue;

      const id = comment.id || comment.commentUrn;
      const commentText = comment.message.text;
      const parentCommentUrn = comment.commentUrn || (comment.id ? `urn:li:comment:(${postUrn},${comment.id})` : null);

      try {
        const reply = await createReply(postText, commentText);
        await createLinkedInComment(postUrn, reply, parentCommentUrn);
        repliedCommentIds.add(id);
        replyCount += 1;
        console.log(`Replied to LinkedIn comment ${id}.`);
      } catch (error) {
        repliedCommentIds.add(id);
        console.warn(`Reply skipped for comment ${id}: ${error.message}`);
      }
    }

    if (Date.now() + intervalSeconds * 1000 < deadline && replyCount < maxReplies) {
      await sleep(intervalSeconds * 1000);
    } else {
      break;
    }
  }

  console.log(`Comment monitoring finished. Replies posted: ${replyCount}.`);
}

async function main() {
  for (const name of REQUIRED) requireEnv(name);

  const post = await createBiotechPost();
  console.log("Generated biotech LinkedIn post:\n");
  console.log(post.text);

  const imageBuffer = await generateBiotechImage(post.text, post.newsContext);
  console.log(`Generated biotech image (${imageBuffer.length} bytes).`);

  if (process.env.DRY_RUN === "true") {
    console.log("\nDRY_RUN=true, so the post and image were not published.");
    return;
  }

  const imageUrn = await uploadImageToLinkedIn(imageBuffer);
  console.log(`Uploaded LinkedIn image: ${imageUrn}`);

  const id = await publishToLinkedIn(post.text, imageUrn, createAltText(post.text));
  console.log(`\nPublished image-backed LinkedIn post: ${id}`);
  await monitorAndReplyToComments(id, post.text);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
