const REQUIRED = ["OPENAI_API_KEY", "LINKEDIN_ACCESS_TOKEN", "LINKEDIN_AUTHOR_URN"];

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

async function createBiotechPost() {
  const openAiKey = requireEnv("OPENAI_API_KEY");
  const model = process.env.OPENAI_MODEL || "gpt-5";
  const repo = process.env.GITHUB_REPOSITORY || "meenavignesh-svg/daily_biotech_based_linkedin_post";
  const runUrl = process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : "GitHub Actions";

  const prompt = `Write one original LinkedIn post about biotech for a professional audience.\n\nContext:\n- GitHub repository: ${repo}\n- Automation run: ${runUrl}\n- The post should be useful for biotech founders, researchers, AI builders, or bioinformatics/product teams.\n\nRequirements:\n- 900 characters or less.\n- Strong first line hook.\n- Human, credible, practical tone.\n- Focus on one clear biotech idea: AI in drug discovery, genomics, diagnostics, lab automation, bioinformatics, clinical trials, synthetic biology, or biotech operations.\n- Avoid medical advice, unsupported clinical claims, hype, and fake statistics.\n- End with 3 to 5 relevant hashtags.\n- Do not mention that an AI wrote it.\n- Return only the LinkedIn post text.`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openAiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: prompt,
      max_output_tokens: 500
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
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
