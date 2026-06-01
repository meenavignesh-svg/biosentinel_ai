const AGENTS = {
  builder: {
    name: "Builder",
    role: "You are a pragmatic systems builder. Focus on implementation steps, architecture, and what can be shipped."
  },
  skeptic: {
    name: "Skeptic",
    role: "You are a rigorous skeptic. Look for weak assumptions, hidden failure modes, missing evidence, and overclaiming."
  },
  evidence: {
    name: "Evidence Analyst",
    role: "You are an evidence analyst. Separate facts, assumptions, unknowns, and what would need verification."
  },
  risk: {
    name: "Risk Reviewer",
    role: "You are a risk reviewer. Focus on safety, privacy, compliance, misuse, operational risk, and user harm."
  },
  operator: {
    name: "Operator",
    role: "You are an operator. Focus on workflow, cost, maintainability, monitoring, and how this behaves under real use."
  }
};

const els = {
  apiButton: document.getElementById("apiButton"),
  apiDialog: document.getElementById("apiDialog"),
  apiKeyInput: document.getElementById("apiKeyInput"),
  saveKeyButton: document.getElementById("saveKeyButton"),
  keyState: document.getElementById("keyState"),
  questionInput: document.getElementById("questionInput"),
  modelInput: document.getElementById("modelInput"),
  depthInput: document.getElementById("depthInput"),
  runButton: document.getElementById("runButton"),
  clearButton: document.getElementById("clearButton"),
  copyButton: document.getElementById("copyButton"),
  statusTrack: document.getElementById("statusTrack"),
  statusText: document.getElementById("statusText"),
  consensusOutput: document.getElementById("consensusOutput"),
  agentOutputs: document.getElementById("agentOutputs"),
  canvas: document.getElementById("signalCanvas")
};

let apiKey = sessionStorage.getItem("openai_api_key") || "";
let latestConsensus = "";

function setStatus(text, state = "") {
  els.statusText.textContent = text;
  els.statusTrack.className = `status-track ${state}`.trim();
}

function syncKeyState() {
  const ready = Boolean(apiKey);
  els.keyState.textContent = ready ? "API connected" : "API key required";
  els.keyState.classList.toggle("ready", ready);
  els.runButton.disabled = !ready;
}

function selectedAgents() {
  return [...document.querySelectorAll("[data-agent]:checked")]
    .map((input) => input.dataset.agent)
    .filter((id) => AGENTS[id]);
}

function depthInstruction() {
  const depth = els.depthInput.value;
  if (depth === "fast") return "Be concise. Give only the highest-signal points.";
  if (depth === "deep") return "Reason carefully. Include tradeoffs, edge cases, and a practical recommendation.";
  return "Be balanced: enough detail to be useful, but avoid padding.";
}

function extractOutputText(data) {
  if (data.output_text) return data.output_text.trim();

  const chunks = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) chunks.push(content.text);
    }
  }
  return chunks.join("\n").trim();
}

async function callResponsesAPI(input, maxOutputTokens = 900) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: els.modelInput.value,
      input,
      max_output_tokens: maxOutputTokens
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${text}`);
  }

  const data = await response.json();
  const output = extractOutputText(data);
  if (!output) throw new Error("The API returned an empty response.");
  return output;
}

function renderAgentShell(agentIds) {
  els.agentOutputs.innerHTML = "";
  for (const id of agentIds) {
    const block = document.createElement("article");
    block.className = "agent-output";
    block.id = `agent-${id}`;
    block.innerHTML = `<h3>${AGENTS[id].name}</h3><p>Waiting...</p>`;
    els.agentOutputs.appendChild(block);
  }
}

function updateAgentBlock(id, text, failed = false) {
  const block = document.getElementById(`agent-${id}`);
  if (!block) return;
  block.innerHTML = `<h3>${AGENTS[id].name}</h3><p>${escapeHtml(text)}</p>`;
  block.style.borderColor = failed ? "rgba(165, 54, 54, 0.45)" : "";
}

function escapeHtml(value) {
  return value.replace(/[&<>"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;"
  }[char]));
}

function agentPrompt(agent, question) {
  return `${agent.role}\n\nTask:\n${question}\n\n${depthInstruction()}\n\nReturn this structure:\nPosition: your direct answer.\nReasoning: 3-5 compact bullets.\nWatchouts: key risks or missing information.\nRecommendation: the next practical step.\n\nDo not mention other agents. Do not fabricate sources.`;
}

function synthesisPrompt(question, agentResults) {
  const evidence = agentResults.map((result) => `${result.name}:\n${result.output}`).join("\n\n---\n\n");
  return `You are the consensus chair. Synthesize multiple independent agent reviews into one practical answer.\n\nOriginal task:\n${question}\n\nAgent reviews:\n${evidence}\n\nReturn this structure:\nConsensus answer: the best combined answer in plain English.\nAgreement: where the agents align.\nDisagreement: where they differ or where uncertainty remains.\nDecision: what should be done next.\nRisks: what to watch before acting.\nConfidence: Low, Medium, or High with one sentence explaining why.\n\nBe decisive, but do not hide uncertainty.`;
}

async function runConsensus() {
  const question = els.questionInput.value.trim();
  const agentIds = selectedAgents();

  if (!apiKey) {
    els.apiDialog.showModal();
    return;
  }

  if (!question) {
    setStatus("Add a question or task first.", "error");
    return;
  }

  if (agentIds.length < 2) {
    setStatus("Choose at least two agents for a real consensus.", "error");
    return;
  }

  els.runButton.disabled = true;
  els.consensusOutput.textContent = "Running independent agent reviews...";
  renderAgentShell(agentIds);
  setStatus("Agents are reviewing independently.", "running");

  try {
    const results = await Promise.all(agentIds.map(async (id) => {
      try {
        const output = await callResponsesAPI(agentPrompt(AGENTS[id], question), els.depthInput.value === "deep" ? 1200 : 800);
        updateAgentBlock(id, output);
        return { id, name: AGENTS[id].name, output };
      } catch (error) {
        const output = `Failed: ${error.message}`;
        updateAgentBlock(id, output, true);
        return { id, name: AGENTS[id].name, output, failed: true };
      }
    }));

    const usable = results.filter((result) => !result.failed);
    if (usable.length < 2) throw new Error("Fewer than two agents completed successfully.");

    setStatus("Synthesizing consensus.", "running");
    latestConsensus = await callResponsesAPI(synthesisPrompt(question, usable), els.depthInput.value === "deep" ? 1400 : 950);
    els.consensusOutput.textContent = latestConsensus;
    setStatus("Consensus complete.", "done");
  } catch (error) {
    els.consensusOutput.textContent = `The run stopped before consensus.\n\n${error.message}`;
    setStatus("Consensus failed. Check the API key, model, or network.", "error");
  } finally {
    syncKeyState();
  }
}

function clearAll() {
  els.questionInput.value = "";
  els.consensusOutput.innerHTML = "<p>The engine will ask multiple specialist agents for independent views, then synthesize agreement, disagreement, risks, and a practical next step.</p>";
  els.agentOutputs.innerHTML = "";
  latestConsensus = "";
  setStatus(apiKey ? "Ready." : "Connect an API key to begin.", apiKey ? "done" : "");
}

function setupDialog() {
  els.apiButton.addEventListener("click", () => {
    els.apiKeyInput.value = apiKey;
    els.apiDialog.showModal();
  });

  els.saveKeyButton.addEventListener("click", (event) => {
    event.preventDefault();
    apiKey = els.apiKeyInput.value.trim();
    if (apiKey) sessionStorage.setItem("openai_api_key", apiKey);
    else sessionStorage.removeItem("openai_api_key");
    syncKeyState();
    setStatus(apiKey ? "Ready." : "Connect an API key to begin.", apiKey ? "done" : "");
    els.apiDialog.close();
  });
}

function setupActions() {
  els.runButton.addEventListener("click", runConsensus);
  els.clearButton.addEventListener("click", clearAll);
  els.copyButton.addEventListener("click", async () => {
    const text = latestConsensus || els.consensusOutput.textContent.trim();
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setStatus("Copied consensus to clipboard.", "done");
  });
}

function setupCanvas() {
  const canvas = els.canvas;
  const ctx = canvas.getContext("2d");
  let width = 0;
  let height = 0;
  let particles = [];

  function resize() {
    width = canvas.width = window.innerWidth * window.devicePixelRatio;
    height = canvas.height = window.innerHeight * window.devicePixelRatio;
    const count = Math.min(90, Math.max(36, Math.floor(window.innerWidth / 18)));
    particles = Array.from({ length: count }, (_, index) => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.22 * window.devicePixelRatio,
      vy: (Math.random() - 0.5) * 0.22 * window.devicePixelRatio,
      r: (index % 5 === 0 ? 2.2 : 1.4) * window.devicePixelRatio
    }));
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "rgba(7, 132, 127, 0.16)";
    ctx.strokeStyle = "rgba(47, 103, 177, 0.12)";
    ctx.lineWidth = window.devicePixelRatio;

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > width) p.vx *= -1;
      if (p.y < 0 || p.y > height) p.vy *= -1;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    for (let i = 0; i < particles.length; i += 1) {
      for (let j = i + 1; j < particles.length; j += 1) {
        const a = particles[i];
        const b = particles[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < 130 * window.devicePixelRatio) {
          ctx.globalAlpha = 1 - distance / (130 * window.devicePixelRatio);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
    }

    requestAnimationFrame(draw);
  }

  resize();
  draw();
  window.addEventListener("resize", resize);
}

setupDialog();
setupActions();
setupCanvas();
syncKeyState();
setStatus(apiKey ? "Ready." : "Connect an API key to begin.", apiKey ? "done" : "");
