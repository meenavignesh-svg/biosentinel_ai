const REQUIRED = ["OPENAI_API_KEY", "LINKEDIN_ACCESS_TOKEN", "LINKEDIN_AUTHOR_URN"];

const DEFAULT_NEWS_FEEDS = [
  "https://news.google.com/rss/search?q=biotech+OR+biotechnology+OR+bioinformatics+OR+genomics+OR+drug+discovery+when:1d&hl=en-US&gl=US&ceid=US:en",
  "https://news.google.com/rss/search?q=AI+biotech+OR+AI+drug+discovery+OR+computational+biology+when:1d&hl=en-US&gl=US&ceid=US:en",
  "https://www.fiercebiotech.com/rss/xml",
  "https://www.genengnews.com/feed/"
];

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalInt(name, fallback) {
  const value = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function linkedInHeaders() {
  return {
    "Authorization": `Bearer ${requireEnv("LINKEDIN_ACCESS_TOKEN")}`,
    "Content-Type": "application/json",
    "Linkedin-Version": process.env.LINKEDIN_VERSION || "202605",
    "X-Restli-Protocol-Version": "2.0.0"
  };
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
      const response = await fetch(feed, {
        headers: { "User-Agent": "biotech-linkedin-automation/1.0" }
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const xml = await response.text();
      items.push(...parseRssItems(xml, feed));
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
      if (content.type === "output_text" && content.text) {
        chunks.push(content.text);
      }
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

  if (!response.ok) {
    throw new Error(`OpenAI request failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  return extractOutputText(data);
}

async function createBiotechPost() {
  const repo = process.env.GITHUB_REPOSITORY || "meenavignesh-svg/daily_biotech_based_linkedin_post";
  const newsItems = await fetchBiotechNews();
  const newsContext = formatNewsContext(newsItems);
  const runUrl = process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : "GitHub Actions";

  const prompt = `Write one humanized LinkedIn post based on current biotech news for recruiters, founders, and biotech industry experts.\n\nContext:\n- GitHub repository context: ${repo}\n- Automation run context: ${runUrl}\n- Audience: recruiters, biotech founders, AI builders, bioinformatics teams, and technical industry experts.\n- Goal: show the author can turn biotech news into practical software, data, and product insight.\n\nRecent biotech news candidates:\n${newsContext}\n\nChoose one news angle and interpret it like a thoughtful human operator, not a news bot. Explain why it matters, what technical bottleneck or opportunity sits underneath it, and what builders should pay attention to.\n\nPost blueprint:\n1. Hook: one sharp human observation or tension from the news.\n2. Context: summarize the news angle in plain English without copying headlines.\n3. Core value: 3 to 4 skimmable bullets with practical implications for biotech data, AI, bioinformatics, clinical operations, lab automation, drug discovery, genomics, or diagnostics.\n4. Takeaway: one sentence on what this means for builders or teams.\n5. Interaction prompt: ask a specific analytical question.\n\nHard rules:\n- 1,100 characters or less.\n- No external URLs.\n- Do not mention a repository link, GitHub link, comments link, or link in comments.\n- Do not copy article headlines verbatim.\n- Do not sound automated, corporate, generic, or like a press release.\n- Use first-person judgment lightly if it makes the post feel more human.\n- Keep paragraphs to 1 or 2 lines.\n- Avoid medical advice, unsupported clinical claims, hype, and fake statistics.\n- If using a metric, make it a clearly framed estimate or engineering target unless it is directly supported by the news context.\n- End with 3 to 5 relevant hashtags.\n- Do not mention that an AI wrote it.\n- Return only the LinkedIn post text.`;

  const post = await callOpenAI(prompt, 650);
  if (!post) throw new Error("OpenAI returned an empty post.");
  return post;
}

async function publishToLinkedIn(commentary) {
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
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false
    })
  });

  if (!response.ok) {
    throw new Error(`LinkedIn post failed: ${response.status} ${await response.text()}`);
  }

  return response.headers.get("x-restli-id") || "published";
}

async function createLinkedInComment(postUrn, text, parentCommentUrn = null) {
  const author = requireEnv("LINKEDIN_AUTHOR_URN");
  const encodedPostUrn = encodeURIComponent(postUrn);
  const body = {
    actor: author,
    object: postUrn,
    message: { text }
  };

  if (parentCommentUrn) body.parentComment = parentCommentUrn;

  const response = await fetch(`https://api.linkedin.com/rest/socialActions/${encodedPostUrn}/comments`, {
    method: "POST",
    headers: linkedInHeaders(),
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`LinkedIn comment failed: ${response.status} ${await response.text()}`);
  }
}

async function fetchTopLevelComments(postUrn) {
  const encodedPostUrn = encodeURIComponent(postUrn);
  const response = await fetch(`https://api.linkedin.com/rest/socialActions/${encodedPostUrn}/comments`, {
    method: "GET",
    headers: linkedInHeaders()
  });

  if (!response.ok) {
    throw new Error(`LinkedIn comment read failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  return Array.isArray(data.elements) ? data.elements : [];
}

function shouldReplyToComment(comment, repliedCommentIds) {
  const author = requireEnv("LINKEDIN_AUTHOR_URN");
  const text = comment?.message?.text || "";
  const id = comment?.id || comment?.commentUrn;

  if (!id || repliedCommentIds.has(id)) return false;
  if (comment.actor === author) return false;
  if (!text.trim()) return false;

  return true;
}

async function createReply(postText, commentText) {
  const prompt = `Write a thoughtful LinkedIn reply to this comment on a biotech news analysis post.\n\nOriginal post:\n${postText}\n\nComment to reply to:\n${commentText}\n\nReply requirements:\n- 450 characters or less.\n- Sound human, practical, and informed.\n- Add substance: a tradeoff, implementation detail, question, or biotech data/AI angle.\n- Be warm and professional.\n- Do not use hashtags.\n- Do not include links.\n- Do not claim clinical outcomes or invent statistics.\n- Return only the reply text.`;

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
  console.log("Generated LinkedIn post:\n");
  console.log(post);

  if (process.env.DRY_RUN === "true") {
    console.log("\nDRY_RUN=true, so the post was not published.");
    return;
  }

  const id = await publishToLinkedIn(post);
  console.log(`\nPublished to LinkedIn: ${id}`);
  await monitorAndReplyToComments(id, post);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
