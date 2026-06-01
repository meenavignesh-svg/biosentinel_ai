const CODON_TABLE = {
  TTT: "F", TTC: "F", TTA: "L", TTG: "L", TCT: "S", TCC: "S", TCA: "S", TCG: "S",
  TAT: "Y", TAC: "Y", TAA: "*", TAG: "*", TGT: "C", TGC: "C", TGA: "*", TGG: "W",
  CTT: "L", CTC: "L", CTA: "L", CTG: "L", CCT: "P", CCC: "P", CCA: "P", CCG: "P",
  CAT: "H", CAC: "H", CAA: "Q", CAG: "Q", CGT: "R", CGC: "R", CGA: "R", CGG: "R",
  ATT: "I", ATC: "I", ATA: "I", ATG: "M", ACT: "T", ACC: "T", ACA: "T", ACG: "T",
  AAT: "N", AAC: "N", AAA: "K", AAG: "K", AGT: "S", AGC: "S", AGA: "R", AGG: "R",
  GTT: "V", GTC: "V", GTA: "V", GTG: "V", GCT: "A", GCC: "A", GCA: "A", GCG: "A",
  GAT: "D", GAC: "D", GAA: "E", GAG: "E", GGT: "G", GGC: "G", GGA: "G", GGG: "G"
};

const AA_WEIGHTS = {
  A: 89.09, R: 174.2, N: 132.12, D: 133.1, C: 121.16, Q: 146.15, E: 147.13, G: 75.07,
  H: 155.16, I: 131.17, L: 131.17, K: 146.19, M: 149.21, F: 165.19, P: 115.13, S: 105.09,
  T: 119.12, W: 204.23, Y: 181.19, V: 117.15
};

const AGENTS = {
  sequence: {
    name: "Sequence Analyst",
    role: "You are a bioinformatics sequence analyst. Review sequence composition, ORFs, GC content, and likely interpretation limits."
  },
  annotation: {
    name: "Annotation Reviewer",
    role: "You are a genome annotation reviewer. Focus on coding potential, frame choices, stop codons, and what annotation evidence is missing."
  },
  wetlab: {
    name: "Wet Lab Planner",
    role: "You are a wet lab planner. Focus on PCR, primers, cloning practicality, and bench checks without giving medical advice."
  },
  quality: {
    name: "Data QC",
    role: "You are a bioinformatics data quality reviewer. Focus on ambiguous bases, sequence validity, reproducibility, and input hygiene."
  },
  safety: {
    name: "Safety Reviewer",
    role: "You are a biosafety and responsible-use reviewer. Identify claims to avoid, uncertainty, and safe next steps."
  }
};

const els = {
  apiButton: document.getElementById("apiButton"),
  apiDialog: document.getElementById("apiDialog"),
  apiKeyInput: document.getElementById("apiKeyInput"),
  saveKeyButton: document.getElementById("saveKeyButton"),
  keyState: document.getElementById("keyState"),
  sequenceInput: document.getElementById("sequenceInput"),
  sequenceType: document.getElementById("sequenceType"),
  forwardPrimer: document.getElementById("forwardPrimer"),
  reversePrimer: document.getElementById("reversePrimer"),
  researchQuestion: document.getElementById("researchQuestion"),
  modelInput: document.getElementById("modelInput"),
  depthInput: document.getElementById("depthInput"),
  analyzeButton: document.getElementById("analyzeButton"),
  primerButton: document.getElementById("primerButton"),
  exampleButton: document.getElementById("exampleButton"),
  runButton: document.getElementById("runButton"),
  clearButton: document.getElementById("clearButton"),
  copyButton: document.getElementById("copyButton"),
  statusTrack: document.getElementById("statusTrack"),
  statusText: document.getElementById("statusText"),
  metricGrid: document.getElementById("metricGrid"),
  analysisOutput: document.getElementById("analysisOutput"),
  orfsPanel: document.getElementById("orfsPanel"),
  compositionPanel: document.getElementById("compositionPanel"),
  aiPanel: document.getElementById("aiPanel"),
  agentOutputs: document.getElementById("agentOutputs"),
  canvas: document.getElementById("signalCanvas")
};

let apiKey = sessionStorage.getItem("openai_api_key") || "";
let latestReport = "";
let latestAnalysis = null;

function setStatus(text, state = "") {
  els.statusText.textContent = text;
  els.statusTrack.className = `status-track ${state}`.trim();
}

function syncKeyState() {
  const ready = Boolean(apiKey);
  els.keyState.textContent = ready ? "AI connected" : "AI optional";
  els.keyState.classList.toggle("ready", ready);
  els.runButton.disabled = !ready;
}

function parseFasta(raw) {
  const lines = raw.trim().split(/\r?\n/);
  let header = "Untitled sequence";
  const seqLines = [];
  for (const line of lines) {
    if (line.startsWith(">")) {
      if (header === "Untitled sequence") header = line.slice(1).trim() || header;
    } else {
      seqLines.push(line.trim());
    }
  }
  return { header, sequence: seqLines.join("") };
}

function cleanSequence(value) {
  return value.toUpperCase().replace(/[^A-Z*.-]/g, "").replace(/[.-]/g, "");
}

function detectType(seq) {
  if (!seq) return "unknown";
  const dna = /^[ACGTNRYKMSWBDHV]+$/.test(seq);
  const rna = /^[ACGUNRYKMSWBDHV]+$/.test(seq);
  if (dna && !seq.includes("U")) return "dna";
  if (rna && seq.includes("U")) return "rna";
  return "protein";
}

function counts(seq) {
  return [...seq].reduce((acc, char) => {
    acc[char] = (acc[char] || 0) + 1;
    return acc;
  }, {});
}

function percent(value, total) {
  return total ? ((value / total) * 100).toFixed(2) : "0.00";
}

function reverseComplement(seq, type) {
  const map = type === "rna"
    ? { A: "U", U: "A", C: "G", G: "C", N: "N" }
    : { A: "T", T: "A", C: "G", G: "C", N: "N" };
  return [...seq].reverse().map((base) => map[base] || "N").join("");
}

function translate(seq) {
  const dna = seq.replace(/U/g, "T");
  let protein = "";
  for (let i = 0; i + 2 < dna.length; i += 3) {
    protein += CODON_TABLE[dna.slice(i, i + 3)] || "X";
  }
  return protein;
}

function findOrfs(seq) {
  const dna = seq.replace(/U/g, "T");
  const strands = [
    { name: "+", seq: dna },
    { name: "-", seq: reverseComplement(dna, "dna") }
  ];
  const stops = new Set(["TAA", "TAG", "TGA"]);
  const orfs = [];

  for (const strand of strands) {
    for (let frame = 0; frame < 3; frame += 1) {
      for (let i = frame; i + 2 < strand.seq.length; i += 3) {
        if (strand.seq.slice(i, i + 3) !== "ATG") continue;
        for (let j = i + 3; j + 2 < strand.seq.length; j += 3) {
          if (stops.has(strand.seq.slice(j, j + 3))) {
            const nt = strand.seq.slice(i, j + 3);
            orfs.push({ strand: strand.name, frame: frame + 1, start: i + 1, end: j + 3, ntLength: nt.length, aaLength: nt.length / 3 - 1, protein: translate(nt).replace(/\*$/, "") });
            break;
          }
        }
      }
    }
  }

  return orfs.sort((a, b) => b.ntLength - a.ntLength).slice(0, 12);
}

function molecularWeight(protein) {
  const total = [...protein.replace(/\*/g, "")].reduce((sum, aa) => sum + (AA_WEIGHTS[aa] || 0), 0);
  return total ? total.toFixed(2) : "N/A";
}

function analyzePrimer(seq) {
  const p = cleanSequence(seq).replace(/U/g, "T");
  const c = counts(p);
  const gc = (c.G || 0) + (c.C || 0);
  const at = (c.A || 0) + (c.T || 0);
  const tm = p.length < 14 ? 2 * at + 4 * gc : 64.9 + 41 * (gc - 16.4) / p.length;
  const homopolymer = /(A{5,}|T{5,}|G{5,}|C{5,})/.test(p);
  const gcPct = Number(percent(gc, p.length));
  const warnings = [];
  if (p.length < 18 || p.length > 25) warnings.push("Length is outside the common 18-25 nt primer range.");
  if (gcPct < 40 || gcPct > 60) warnings.push("GC content is outside the common 40-60% range.");
  if (homopolymer) warnings.push("Contains a homopolymer run of 5 or more bases.");
  if (!/^[ACGT]+$/.test(p)) warnings.push("Contains ambiguous or invalid bases.");
  return { sequence: p, length: p.length, gcPct, tm: Number.isFinite(tm) ? tm.toFixed(1) : "N/A", warnings };
}

function analyzeSequence() {
  const raw = els.sequenceInput.value.trim();
  if (!raw) {
    setStatus("Paste a sequence first.", "error");
    return;
  }

  const parsed = parseFasta(raw);
  const seq = cleanSequence(parsed.sequence || raw);
  const type = els.sequenceType.value === "auto" ? detectType(seq) : els.sequenceType.value;
  const c = counts(seq);
  const gc = (c.G || 0) + (c.C || 0);
  const ambiguous = [...seq].filter((char) => !"ACGTU".includes(char) && type !== "protein").length;
  const dnaLike = type === "dna" || type === "rna";
  const rc = dnaLike ? reverseComplement(seq, type) : "N/A";
  const rna = type === "dna" ? seq.replace(/T/g, "U") : "N/A";
  const protein = dnaLike ? translate(seq) : seq;
  const orfs = dnaLike ? findOrfs(seq) : [];
  const composition = c;

  latestAnalysis = { header: parsed.header, seq, type, counts: c, gcPct: percent(gc, seq.length), ambiguous, rc, rna, protein, orfs, composition };
  renderAnalysis(latestAnalysis);
  setStatus("Local bioinformatics analysis complete.", "done");
}

function renderMetrics(items) {
  els.metricGrid.innerHTML = items.map((item) => `<div class="metric-card"><span>${item.label}</span><strong>${item.value}</strong></div>`).join("");
}

function renderAnalysis(a) {
  const metrics = [
    { label: "Type", value: a.type.toUpperCase() },
    { label: "Length", value: a.seq.length.toLocaleString() },
    { label: "GC", value: a.type === "protein" ? "N/A" : `${a.gcPct}%` },
    { label: "ORFs", value: a.orfs.length }
  ];
  renderMetrics(metrics);

  const preview = a.seq.slice(0, 120) + (a.seq.length > 120 ? "..." : "");
  latestReport = [
    `Sequence: ${a.header}`,
    `Detected type: ${a.type}`,
    `Length: ${a.seq.length}`,
    a.type === "protein" ? `Approx protein MW: ${molecularWeight(a.seq)} Da` : `GC content: ${a.gcPct}%`,
    `Ambiguous bases: ${a.ambiguous}`,
    `Preview: ${preview}`,
    a.type !== "protein" ? `Reverse complement: ${a.rc.slice(0, 160)}${a.rc.length > 160 ? "..." : ""}` : "",
    a.type !== "protein" ? `Translation frame +1: ${a.protein.slice(0, 160)}${a.protein.length > 160 ? "..." : ""}` : ""
  ].filter(Boolean).join("\n");

  els.analysisOutput.textContent = latestReport;
  renderOrfs(a.orfs);
  renderComposition(a.composition, a.seq.length);
}

function renderOrfs(orfs) {
  if (!orfs.length) {
    els.orfsPanel.innerHTML = `<p class="muted-copy">No complete ATG-to-stop ORFs found in the scanned frames.</p>`;
    return;
  }
  els.orfsPanel.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Strand</th><th>Frame</th><th>Start</th><th>End</th><th>nt</th><th>aa</th><th>Protein preview</th></tr></thead><tbody>${orfs.map((orf) => `<tr><td>${orf.strand}</td><td>${orf.frame}</td><td>${orf.start}</td><td>${orf.end}</td><td>${orf.ntLength}</td><td>${orf.aaLength}</td><td><code>${orf.protein.slice(0, 42)}${orf.protein.length > 42 ? "..." : ""}</code></td></tr>`).join("")}</tbody></table></div>`;
}

function renderComposition(composition, length) {
  const rows = Object.keys(composition).sort().map((key) => `<tr><td>${key}</td><td>${composition[key]}</td><td>${percent(composition[key], length)}%</td></tr>`).join("");
  els.compositionPanel.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Symbol</th><th>Count</th><th>Percent</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function checkPrimers() {
  const f = analyzePrimer(els.forwardPrimer.value);
  const r = analyzePrimer(els.reversePrimer.value);
  const delta = Math.abs(Number(f.tm) - Number(r.tm));
  const pairWarnings = [];
  if (Number.isFinite(delta) && delta > 3) pairWarnings.push("Primer Tm difference is greater than 3 C.");
  const report = [
    `Forward: ${f.sequence || "N/A"}`,
    `Length: ${f.length}, GC: ${f.gcPct || 0}%, Tm: ${f.tm} C`,
    f.warnings.length ? `Warnings: ${f.warnings.join(" ")}` : "Warnings: none",
    "",
    `Reverse: ${r.sequence || "N/A"}`,
    `Length: ${r.length}, GC: ${r.gcPct || 0}%, Tm: ${r.tm} C`,
    r.warnings.length ? `Warnings: ${r.warnings.join(" ")}` : "Warnings: none",
    "",
    pairWarnings.length ? `Pair warning: ${pairWarnings.join(" ")}` : "Pair check: no major issue from simple length/GC/Tm rules."
  ].join("\n");
  latestReport = `${latestReport}\n\nPrimer QC\n${report}`.trim();
  els.analysisOutput.textContent = latestReport;
  setStatus("Primer QC complete.", "done");
}

function selectedAgents() {
  return [...document.querySelectorAll("[data-agent]:checked")].map((input) => input.dataset.agent).filter((id) => AGENTS[id]);
}

function depthInstruction() {
  if (els.depthInput.value === "fast") return "Be concise and practical.";
  if (els.depthInput.value === "deep") return "Reason carefully with tradeoffs, validation checks, and uncertainty.";
  return "Be balanced and useful.";
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
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: els.modelInput.value, input, max_output_tokens: maxOutputTokens })
  });
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  const output = extractOutputText(await response.json());
  if (!output) throw new Error("The API returned an empty response.");
  return output;
}

function agentPrompt(agent, question) {
  return `${agent.role}\n\nLocal analysis report:\n${latestReport}\n\nUser question:\n${question || "Review this sequence analysis and suggest bioinformatics next steps."}\n\n${depthInstruction()}\n\nReturn: key interpretation, checks to run next, and what not to overclaim. No medical advice. No fabricated database matches.`;
}

function synthesisPrompt(question, agentResults) {
  const evidence = agentResults.map((result) => `${result.name}:\n${result.output}`).join("\n\n---\n\n");
  return `Synthesize these bioinformatics agent reviews.\n\nLocal analysis report:\n${latestReport}\n\nUser question:\n${question || "Review this sequence analysis."}\n\nAgent reviews:\n${evidence}\n\nReturn:\nConsensus interpretation:\nAgreement:\nUncertainty:\nRecommended next checks:\nCautions:\nConfidence: Low, Medium, or High with one sentence.`;
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
  return value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[char]));
}

async function runConsensus() {
  if (!apiKey) return els.apiDialog.showModal();
  if (!latestAnalysis) analyzeSequence();
  if (!latestAnalysis) return;
  const agentIds = selectedAgents();
  if (agentIds.length < 2) return setStatus("Choose at least two agents for consensus.", "error");

  switchTab("ai");
  els.runButton.disabled = true;
  renderAgentShell(agentIds);
  setStatus("Bioinformatics agents are reviewing the analysis.", "running");

  try {
    const question = els.researchQuestion.value.trim();
    const results = await Promise.all(agentIds.map(async (id) => {
      try {
        const output = await callResponsesAPI(agentPrompt(AGENTS[id], question), els.depthInput.value === "deep" ? 1100 : 750);
        updateAgentBlock(id, output);
        return { id, name: AGENTS[id].name, output };
      } catch (error) {
        updateAgentBlock(id, `Failed: ${error.message}`, true);
        return { id, name: AGENTS[id].name, output: error.message, failed: true };
      }
    }));
    const usable = results.filter((result) => !result.failed);
    if (usable.length < 2) throw new Error("Fewer than two agents completed successfully.");
    const consensus = await callResponsesAPI(synthesisPrompt(question, usable), els.depthInput.value === "deep" ? 1300 : 900);
    latestReport = `${latestReport}\n\nAI Consensus\n${consensus}`;
    els.aiPanel.insertAdjacentHTML("afterbegin", `<article class="consensus-output ai-summary">${escapeHtml(consensus)}</article>`);
    setStatus("AI consensus complete.", "done");
  } catch (error) {
    setStatus("AI consensus failed. Check the API key, model, or network.", "error");
    els.aiPanel.insertAdjacentHTML("afterbegin", `<article class="consensus-output">${escapeHtml(error.message)}</article>`);
  } finally {
    syncKeyState();
  }
}

function switchTab(tab) {
  document.querySelectorAll(".tab-button").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
  els.orfsPanel.classList.toggle("hidden", tab !== "orfs");
  els.compositionPanel.classList.toggle("hidden", tab !== "composition");
  els.aiPanel.classList.toggle("hidden", tab !== "ai");
}

function clearAll() {
  els.sequenceInput.value = "";
  els.forwardPrimer.value = "";
  els.reversePrimer.value = "";
  els.researchQuestion.value = "";
  els.metricGrid.innerHTML = "";
  els.orfsPanel.innerHTML = "";
  els.compositionPanel.innerHTML = "";
  els.agentOutputs.innerHTML = "";
  els.analysisOutput.innerHTML = "<p>Run an analysis to see cleaned sequence statistics, composition, reverse complement, transcription/translation, ORFs, and primer QC.</p>";
  latestReport = "";
  latestAnalysis = null;
  setStatus("Paste a sequence to begin.", "");
}

function loadExample() {
  els.sequenceInput.value = ">example_orf\nATGGCCATTGTAATGGGCCGCTGAAAGGGTGCCCGATAG";
  els.forwardPrimer.value = "ATGGCCATTGTA";
  els.reversePrimer.value = "CTATCGGGCACC";
  els.researchQuestion.value = "What should I verify before using this sequence as a beginner ORF analysis example?";
  analyzeSequence();
  checkPrimers();
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
    setStatus(apiKey ? "AI consensus ready." : "Local analysis ready. AI not connected.", apiKey ? "done" : "");
    els.apiDialog.close();
  });
}

function setupActions() {
  els.analyzeButton.addEventListener("click", analyzeSequence);
  els.primerButton.addEventListener("click", checkPrimers);
  els.exampleButton.addEventListener("click", loadExample);
  els.runButton.addEventListener("click", runConsensus);
  els.clearButton.addEventListener("click", clearAll);
  els.copyButton.addEventListener("click", async () => {
    if (!latestReport) return;
    await navigator.clipboard.writeText(latestReport);
    setStatus("Report copied to clipboard.", "done");
  });
  document.querySelectorAll(".tab-button").forEach((button) => button.addEventListener("click", () => switchTab(button.dataset.tab)));
}

function setupCanvas() {
  const canvas = els.canvas;
  const ctx = canvas.getContext("2d");
  let width = 0;
  let height = 0;
  let tick = 0;
  function resize() {
    width = canvas.width = window.innerWidth * window.devicePixelRatio;
    height = canvas.height = window.innerHeight * window.devicePixelRatio;
  }
  function draw() {
    tick += 0.008;
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(7, 132, 127, 0.12)";
    ctx.lineWidth = 1.4 * window.devicePixelRatio;
    for (let row = 0; row < 9; row += 1) {
      ctx.beginPath();
      for (let x = 0; x < width; x += 18 * window.devicePixelRatio) {
        const y = height * 0.12 + row * 72 * window.devicePixelRatio + Math.sin(x * 0.006 + tick + row) * 18 * window.devicePixelRatio;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
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
setStatus(apiKey ? "Local analysis and AI consensus ready." : "Local analysis ready. Connect API for AI consensus.", apiKey ? "done" : "");
