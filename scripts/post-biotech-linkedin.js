const REQUIRED = ["OPENAI_API_KEY", "LINKEDIN_ACCESS_TOKEN", "LINKEDIN_AUTHOR_URN"];

const CONTENT_PILLARS = [
  {
    name: "Proof of Work Breakdown",
    brief: "Document a concrete engineering problem, the bioinformatics or biotech context, the implementation choices, and the practical result. Use short code-like snippets or architecture fragments when useful."
  },
  {
    name: "Deep-Dive Carousel Concept",
    brief: "Write a text post that tees up a PDF carousel idea: a compact step-by-step guide or visual breakdown for AI-assisted biotech, genomics, browser-based development, or multi-agent analysis."
  },
  {
    name: "Industrial Symbiosis and Circular Infrastructure",
    brief: "Analyze how compute infrastructure, data centers, lab operations, microbial systems, environmental biotech, or circular infrastructure could reinforce each other."
  },
  {
    name: "Technical Critique and Case Study",
    brief: "Break down a specialized high-performance workflow such as healthcare AI, real-time biological signals, Formula 1-style human performance telemetry, or regional AI infrastructure, then connect it to biotech data engineering."
  }
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

function selectPillar() {
  const runNumber = Number.parseInt(process.env.GITHUB_RUN_NUMBER || "0", 10);
  const hour = new Date().getUTCHours();
  const index = Number.isFinite(runNumber) && runNumber > 0
    ? runNumber % CONTENT_PILLARS.length
    : Math.floor(hour / 2) % CONTENT_PILLARS.length;
  return CONTENT_PILLARS[index];
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
  const pillar = selectPillar();
  const runUrl = process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : "GitHub Actions";

  const prompt = `Write one original high-dwell LinkedIn post for recruiters, founders, and biotech industry experts.\n\nContext:\n- GitHub repository: ${repo}\n- Automation run: ${runUrl}\n- Audience: recruiters, biotech founders, AI builders, bioinformatics teams, and technical industry experts.\n- Goal: prove the author can bridge complex biology and practical software engineering.\n\nUse this content pillar today:\n${pillar.name}: ${pillar.brief}\n\nPost blueprint:\n1. Hook: bold, specific technical tension or practical claim.\n2. Context: explain the concrete biotech/software challenge without fluff.\n3. Core value: 3 to 4 skimmable bullets with specific engineering choices, systems thinking, tradeoffs, or implementation details.\n4. Takeaway: one sentence on impact.\n5. Interaction prompt: ask a specific analytical question.\n\nHard rules:\n- 1,100 characters or less.\n- No external URL in the post body.\n- Include this sentence near the end when relevant: Code repository link in the comments below.\n- Keep paragraphs to 1 or 2 lines.\n- Human, credible, practical tone.\n- Avoid generic news summaries.\n- Avoid medical advice, unsupported clinical claims, hype, and fake statistics.\n- If using a metric, make it a clearly framed estimate or engineering target unless it is directly supported.\n- End with 3 to 5 relevant hashtags.\n- Do not mention that an AI wrote it.\n- Return only the LinkedIn post text.`;

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

async function addRepositoryComment(postUrn) {
  if (process.env.POST_REPOSITORY_COMMENT === "false") return;
  if (!postUrn || postUrn === "published") {
    console.warn("LinkedIn did not return a post URN, so the repository comment was skipped.");
    return;
  }

  const repoUrl = process.env.REPOSITORY_COMMENT_URL || "https://github.com/meenavignesh-svg/daily_biotech_based_linkedin_post";
  const commentText = `Code repository: ${repoUrl}`;

  try {
    await createLinkedInComment(postUrn, commentText);
    console.log("Added repository link as first comment.");
  } catch (error) {
    console.warn(error.message);
    console.warn("The LinkedIn post is already published. Check that the token has social feed comment permission if you want automatic first comments.");
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
  if (text.startsWith("Code repository:")) return false;
  if (!text.trim()) return false;

  return true;
}

async function createReply(postText, commentText) {
  const prompt = `Write a thoughtful LinkedIn reply to this comment on a biotech/software post.\n\nOriginal post:\n${postText}\n\nComment to reply to:\n${commentText}\n\nReply requirements:\n- 450 characters or less.\n- Sound like a practical bioinformatics and AI builder.\n- Add substance: a tradeoff, implementation detail, or useful question.\n- Be warm and professional.\n- Do not use hashtags.\n- Do not include links.\n- Do not claim clinical outcomes or invent statistics.\n- Return only the reply text.`;

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
  await addRepositoryComment(id);
  await monitorAndReplyToComments(id, post);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
