const fs = require("node:fs");

const DEFAULT_SOURCE_REPOSITORIES = "meenavignesh-svg/daily_biotech_based_linkedin_post";

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

function isRetryableStatus(status) {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

async function fetchWithRetry(url, options = {}, label = "request") {
  const attempts = optionalInt("REQUEST_RETRY_ATTEMPTS", 3);
  const baseDelayMs = optionalInt("REQUEST_RETRY_DELAY_MS", 2000);
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (response.ok || !isRetryableStatus(response.status) || attempt === attempts) return response;
      const retryAfter = Number.parseInt(response.headers.get("retry-after") || "", 10);
      const delay = Number.isFinite(retryAfter) ? retryAfter * 1000 : baseDelayMs * attempt;
      console.warn(`${label} returned ${response.status}; retrying in ${delay}ms.`);
      await sleep(delay);
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      const delay = baseDelayMs * attempt;
      console.warn(`${label} failed (${error.message}); retrying in ${delay}ms.`);
      await sleep(delay);
    }
  }

  throw lastError || new Error(`${label} failed after ${attempts} attempts.`);
}

function githubHeaders() {
  const headers = {
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "biostars-draft-generator"
  };

  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return headers;
}

function getSourceRepositories() {
  return (process.env.SOURCE_REPOSITORIES || DEFAULT_SOURCE_REPOSITORIES)
    .split(",")
    .map((repo) => repo.trim())
    .filter(Boolean);
}

async function fetchJson(url, label) {
  const response = await fetchWithRetry(url, { headers: githubHeaders() }, label);
  if (!response.ok) throw new Error(`${label} failed: ${response.status} ${await response.text()}`);
  return response.json();
}

async function fetchReadme(repository) {
  try {
    const response = await fetchWithRetry(`https://api.github.com/repos/${repository}/readme`, {
      headers: githubHeaders()
    }, `${repository} README`);

    if (!response.ok) return "README unavailable.";
    const data = await response.json();
    if (!data.content) return "README unavailable.";
    return Buffer.from(data.content, "base64").toString("utf8").slice(0, 2500);
  } catch (error) {
    console.warn(`README skipped for ${repository}: ${error.message}`);
    return "README unavailable.";
  }
}

async function collectRepositoryContext(repository) {
  const repo = await fetchJson(`https://api.github.com/repos/${repository}`, `${repository} metadata`);
  const [commits, issues, readme] = await Promise.all([
    fetchJson(`https://api.github.com/repos/${repository}/commits?per_page=8`, `${repository} commits`).catch((error) => {
      console.warn(error.message);
      return [];
    }),
    fetchJson(`https://api.github.com/repos/${repository}/issues?state=open&per_page=8`, `${repository} issues`).catch((error) => {
      console.warn(error.message);
      return [];
    }),
    fetchReadme(repository)
  ]);

  return {
    name: repository,
    description: repo.description || "No description provided.",
    language: repo.language || "Unknown",
    topics: repo.topics || [],
    url: repo.html_url,
    readme,
    commits: commits.map((commit) => ({
      message: commit.commit?.message || "",
      date: commit.commit?.committer?.date || "",
      url: commit.html_url
    })),
    issues: issues.filter((issue) => !issue.pull_request).map((issue) => ({
      title: issue.title,
      url: issue.html_url
    }))
  };
}

function renderContext(contexts) {
  return contexts.map((context) => {
    const commits = context.commits.map((commit, index) => `${index + 1}. ${commit.message.split("\n")[0]} (${commit.date})`).join("\n") || "No recent commits.";
    const issues = context.issues.map((issue, index) => `${index + 1}. ${issue.title}`).join("\n") || "No open issues.";
    return `Repository: ${context.name}\nURL: ${context.url}\nDescription: ${context.description}\nLanguage: ${context.language}\nTopics: ${context.topics.join(", ") || "None"}\n\nREADME excerpt:\n${context.readme}\n\nRecent commits:\n${commits}\n\nOpen issues:\n${issues}`;
  }).join("\n\n---\n\n");
}

function createPrompt(contextText) {
  return `Create one Biostars-ready forum post draft from the GitHub repository context below.\n\nRepository context:\n${contextText}\n\nGoal:\n- The post should belong on Biostars: practical bioinformatics, computational biology, genomics, workflows, pipelines, data analysis, reproducibility, or tool usage.\n- It must be useful and sincere, not promotional.\n- Do not auto-post. Generate a draft for human review.\n\nWrite in this exact Markdown structure:\n# Title\nA concise Biostars-style title phrased as a specific question or discussion prompt.\n\n## Tags\ncomma,separated,bioinformatics,tags\n\n## Draft Post\nA clear forum post with:\n- What I am trying to do\n- What I have tried or built\n- The specific uncertainty/problem\n- Minimal reproducible details or pseudo-code if relevant\n- A concrete question for the Biostars community\n\n## Why This Fits Biostars\nOne short paragraph explaining why this is a technical bioinformatics discussion rather than an advertisement.\n\nRules:\n- Bioinformatics only.\n- Humanized, honest, and technical.\n- No hype.\n- No medical advice.\n- No fake results or fabricated benchmarks.\n- Do not claim the repository solves a problem unless context supports it.\n- Avoid marketing language like "revolutionary", "game-changing", or "unlocking the future".\n- If the repo context is weak, frame the post as a careful question, not an announcement.\n- Keep the draft under 900 words.`;
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

async function callOpenAI(prompt) {
  const response = await fetchWithRetry("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${requireEnv("OPENAI_API_KEY")}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5",
      input: prompt,
      max_output_tokens: optionalInt("MAX_OUTPUT_TOKENS", 1600)
    })
  }, "OpenAI draft request");

  if (!response.ok) throw new Error(`OpenAI request failed: ${response.status} ${await response.text()}`);
  return extractOutputText(await response.json());
}

function extractTags(markdown) {
  const match = markdown.match(/## Tags\s+([^#]+)/i);
  if (!match) return ["bioinformatics"];
  return match[1]
    .split(/[\n,]/)
    .map((tag) => tag.trim().replace(/^[-*]\s*/, ""))
    .filter(Boolean)
    .slice(0, 6);
}

function appendPublishLink(markdown) {
  const tags = extractTags(markdown);
  const tagValue = encodeURIComponent(tags.join(","));
  const url = `https://www.biostars.org/p/new/post/?tag_val=${tagValue}`;

  return `${markdown}\n\n## Manual Publish Link\nOpen this link after reviewing the draft:\n${url}\n\n## Safety Note\nThis workflow intentionally creates a draft only. Review it manually before posting to Biostars.`;
}

function writeFailureReport(error, stage) {
  fs.mkdirSync("run-reports", { recursive: true });
  fs.writeFileSync("run-reports/failure.json", JSON.stringify({
    status: "failed",
    stage,
    message: error.message,
    stack: error.stack,
    time: new Date().toISOString()
  }, null, 2));
}

async function main() {
  let stage = "collect repository context";
  try {
    const repositories = getSourceRepositories();
    console.log(`Generating Biostars draft from: ${repositories.join(", ")}`);

    const contexts = await Promise.all(repositories.map(collectRepositoryContext));
    const contextText = renderContext(contexts);

    stage = "generate draft";
    const draft = appendPublishLink(await callOpenAI(createPrompt(contextText)));

    stage = "write draft";
    fs.mkdirSync("biostars-drafts", { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const path = `biostars-drafts/biostars-draft-${stamp}.md`;
    fs.writeFileSync(path, draft);

    console.log(`Biostars draft written to ${path}`);
    console.log("\n--- Draft Preview ---\n");
    console.log(draft);
  } catch (error) {
    writeFailureReport(error, stage);
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
