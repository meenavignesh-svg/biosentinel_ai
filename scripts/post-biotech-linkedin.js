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

async function createBiotechPost() {
  const openAiKey = requireEnv("OPENAI_API_KEY");
  const model = process.env.OPENAI_MODEL || "gpt-5";
  const repo = process.env.GITHUB_REPOSITORY || "meenavignesh-svg/daily_biotech_based_linkedin_post";
  const pillar = selectPillar();
  const runUrl = process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : "GitHub Actions";

  const prompt = `Write one original high-dwell LinkedIn post for recruiters, founders, and biotech industry experts.\n\nContext:\n- GitHub repository: ${repo}\n- Automation run: ${runUrl}\n- Audience: recruiters, biotech founders, AI builders, bioinformatics teams, and technical industry experts.\n- Goal: prove the author can bridge complex biology and practical software engineering.\n\nUse this content pillar today:\n${pillar.name}: ${pillar.brief}\n\nPost blueprint:\n1. Hook: bold, specific technical tension or practical claim.\n2. Context: explain the concrete biotech/software challenge without fluff.\n3. Core value: 3 to 4 skimmable bullets with specific engineering choices, systems thinking, tradeoffs, or implementation details.\n4. Takeaway: one sentence on impact.\n5. Interaction prompt: ask a specific analytical question.\n\nHard rules:\n- 1,100 characters or less.\n- No external URL in the post body.\n- Include this sentence near the end when relevant: Code repository link in the comments below.\n- Keep paragraphs to 1 or 2 lines.\n- Human, credible, practical tone.\n- Avoid generic news summaries.\n- Avoid medical advice, unsupported clinical claims, hype, and fake statistics.\n- If using a metric, make it a clearly framed estimate or engineering target unless it is directly supported.\n- End with 3 to 5 relevant hashtags.\n- Do not mention that an AI wrote it.\n- Return only the LinkedIn post text.`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openAiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: prompt,
      max_output_tokens: 650
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const post = extractOutputText(data);
  if (!post) throw new Error("OpenAI returned an empty post.");
  return post;
}

async function publishToLinkedIn(commentary) {
  const linkedInToken = requireEnv("LINKEDIN_ACCESS_TOKEN");
  const author = requireEnv("LINKEDIN_AUTHOR_URN");
  const linkedInVersion = process.env.LINKEDIN_VERSION || "202605";

  const response = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${linkedInToken}`,
      "Content-Type": "application/json",
      "Linkedin-Version": linkedInVersion,
      "X-Restli-Protocol-Version": "2.0.0"
    },
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

async function addRepositoryComment(postUrn) {
  if (process.env.POST_REPOSITORY_COMMENT === "false") return;
  if (!postUrn || postUrn === "published") {
    console.warn("LinkedIn did not return a post URN, so the repository comment was skipped.");
    return;
  }

  const linkedInToken = requireEnv("LINKEDIN_ACCESS_TOKEN");
  const author = requireEnv("LINKEDIN_AUTHOR_URN");
  const linkedInVersion = process.env.LINKEDIN_VERSION || "202605";
  const repoUrl = process.env.REPOSITORY_COMMENT_URL || "https://github.com/meenavignesh-svg/daily_biotech_based_linkedin_post";
  const commentText = `Code repository: ${repoUrl}`;
  const encodedPostUrn = encodeURIComponent(postUrn);

  const response = await fetch(`https://api.linkedin.com/rest/socialActions/${encodedPostUrn}/comments`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${linkedInToken}`,
      "Content-Type": "application/json",
      "Linkedin-Version": linkedInVersion,
      "X-Restli-Protocol-Version": "2.0.0"
    },
    body: JSON.stringify({
      actor: author,
      object: postUrn,
      message: {
        text: commentText
      }
    })
  });

  if (!response.ok) {
    console.warn(`Repository comment failed: ${response.status} ${await response.text()}`);
    console.warn("The LinkedIn post is already published. Check that the token has social feed comment permission if you want automatic first comments.");
    return;
  }

  console.log("Added repository link as first comment.");
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
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
