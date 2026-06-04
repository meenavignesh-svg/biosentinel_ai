import { useMemo, useState } from "react";
import {
  Activity,
  BadgeCheck,
  Brain,
  Clipboard,
  Dna,
  Download,
  FileUp,
  Microscope,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import { AnalysisResult, analyzeSequence, interpretAnalysis, primerQc } from "./localBio";

const sample = `>research_sample
ATGGCCATTGTAATGGGCCGCTGAAAGGGTGCCCGATAG`;

type Tab = "summary" | "orfs" | "sequence" | "qc";

export default function App() {
  const [sequence, setSequence] = useState(sample);
  const [sequenceType, setSequenceType] = useState("auto");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [question, setQuestion] = useState("What are the key quality checks and next validation steps?");
  const [aiText, setAiText] = useState("");
  const [forwardPrimer, setForwardPrimer] = useState("");
  const [reversePrimer, setReversePrimer] = useState("");
  const [primerResult, setPrimerResult] = useState<unknown>(null);
  const [message, setMessage] = useState("Ready. Paste FASTA, upload a sequence, or use the sample.");
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("summary");

  const compositionRows = useMemo(() => Object.entries(analysis?.composition || {}), [analysis]);

  function runAnalysis(nextSequence = sequence) {
    setBusy(true);
    setAiText("");
    try {
      const result = analyzeSequence(nextSequence, sequenceType);
      setAnalysis(result);
      setActiveTab("summary");
      setMessage("Analysis complete. Metrics, ORFs, restriction sites, and QC notes are ready.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Analysis failed.");
    } finally {
      setBusy(false);
    }
  }

  function askAssistant() {
    if (!analysis) {
      setMessage("Run sequence analysis first, then generate the interpretation.");
      return;
    }
    setBusy(true);
    setAiText(interpretAnalysis(analysis, question));
    setMessage("Rules-based interpretation generated with scientific limitations included.");
    setBusy(false);
  }

  function checkPrimers() {
    setPrimerResult({
      forward: primerQc(forwardPrimer),
      reverse: primerQc(reversePrimer),
      limitations: ["Primer QC is a screening aid only. Confirm with a validated primer-design workflow."]
    });
    setMessage("Primer QC complete.");
    setActiveTab("qc");
  }

  async function uploadFile(file?: File) {
    if (!file) return;
    const text = await file.text();
    setSequence(text);
    runAnalysis(text);
  }

  function downloadReport() {
    if (!analysis) return;
    const report = {
      title: analysis.title,
      generated_at: new Date().toISOString(),
      analysis,
      interpretation: aiText || interpretAnalysis(analysis, question),
      primer_qc: primerResult,
      limitations: analysis.limitations
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${analysis.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-biosentinel-report.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function copyReport() {
    if (!analysis) return;
    const report = [
      `BioSentinel AI Report: ${analysis.title}`,
      `Type: ${analysis.sequence_type.toUpperCase()}`,
      `Length: ${analysis.length}`,
      `GC: ${analysis.gc_percent ?? "n/a"}`,
      "",
      aiText || interpretAnalysis(analysis, question)
    ].join("\n");
    await navigator.clipboard.writeText(report);
    setMessage("Report copied to clipboard.");
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Zero-key desktop bioinformatics workbench</p>
          <h1>BioSentinel AI</h1>
        </div>
        <div className="top-actions">
          <div className="mode-pill"><ShieldCheck size={16} /> No API needed</div>
          <button className="icon-button" onClick={() => { setSequence(sample); setAnalysis(null); setAiText(""); setPrimerResult(null); setMessage("Workspace reset."); }}>
            <RotateCcw size={18} /> Reset
          </button>
        </div>
      </header>

      <section className="desktop-ribbon">
        <div><Brain size={20} /><span>Rules-based interpretation</span></div>
        <div><Dna size={20} /><span>DNA, RNA, protein, FASTA</span></div>
        <div><BadgeCheck size={20} /><span>Honest scientific limits</span></div>
      </section>

      <section className="workspace">
        <aside className="panel controls">
          <div className="panel-title">
            <Microscope size={20} />
            <h2>Input Bench</h2>
          </div>

          <label>Sequence type
            <select value={sequenceType} onChange={(event) => setSequenceType(event.target.value)}>
              <option value="auto">Auto detect</option>
              <option value="dna">DNA</option>
              <option value="rna">RNA</option>
              <option value="protein">Protein</option>
            </select>
          </label>

          <label>FASTA or sequence
            <textarea value={sequence} onChange={(event) => setSequence(event.target.value)} spellCheck={false} />
          </label>

          <div className="button-grid">
            <button className="primary" disabled={busy} onClick={() => runAnalysis()}><Activity size={18} /> Analyze</button>
            <label className="upload">
              <FileUp size={18} /> Upload
              <input type="file" accept=".fa,.fasta,.txt,.seq" onChange={(event) => uploadFile(event.target.files?.[0])} />
            </label>
          </div>

          <div className="primer-box">
            <div className="panel-title compact">
              <Search size={18} />
              <h2>Primer QC</h2>
            </div>
            <div className="primer-grid">
              <input placeholder="Forward primer" value={forwardPrimer} onChange={(event) => setForwardPrimer(event.target.value)} />
              <input placeholder="Reverse primer" value={reversePrimer} onChange={(event) => setReversePrimer(event.target.value)} />
            </div>
            <button onClick={checkPrimers} disabled={busy}>Check primers</button>
          </div>

          <p className="status">{message}</p>
        </aside>

        <section className="results">
          <div className="panel metrics">
            <Metric label="Type" value={analysis?.sequence_type?.toUpperCase() || "-"} />
            <Metric label="Length" value={analysis?.length?.toLocaleString() || "-"} />
            <Metric label="GC" value={analysis?.gc_percent == null ? "-" : `${analysis.gc_percent}%`} />
            <Metric label="ORFs" value={analysis?.orfs?.length?.toString() || "0"} />
          </div>

          <div className="panel tab-panel">
            <nav className="tabs">
              <button className={activeTab === "summary" ? "active" : ""} onClick={() => setActiveTab("summary")}>Summary</button>
              <button className={activeTab === "orfs" ? "active" : ""} onClick={() => setActiveTab("orfs")}>ORFs</button>
              <button className={activeTab === "sequence" ? "active" : ""} onClick={() => setActiveTab("sequence")}>Sequence</button>
              <button className={activeTab === "qc" ? "active" : ""} onClick={() => setActiveTab("qc")}>QC</button>
            </nav>

            {!analysis && <EmptyState />}
            {analysis && activeTab === "summary" && (
              <div className="tab-content">
                <h2>Calculated Results</h2>
                <div className="table">
                  {compositionRows.map(([key, value]) => <span key={key}>{key}: {String(value)}</span>)}
                </div>
                <h3>Restriction sites</h3>
                <pre>{JSON.stringify(analysis.restriction_sites || [], null, 2)}</pre>
              </div>
            )}
            {analysis && activeTab === "orfs" && (
              <div className="tab-content">
                <h2>Open Reading Frames</h2>
                <pre>{JSON.stringify(analysis.orfs || [], null, 2)}</pre>
              </div>
            )}
            {analysis && activeTab === "sequence" && (
              <div className="tab-content split-pre">
                <div>
                  <h2>Translation</h2>
                  <pre>{analysis.translation || "Protein translation is not applicable for this input."}</pre>
                </div>
                <div>
                  <h2>Reverse Complement</h2>
                  <pre>{analysis.reverse_complement || "Reverse complement is not applicable for this input."}</pre>
                </div>
              </div>
            )}
            {analysis && activeTab === "qc" && (
              <div className="tab-content">
                <h2>Quality Notes</h2>
                <ul>{analysis.limitations.map((item) => <li key={item}>{item}</li>)}</ul>
                {primerResult !== null && <pre>{JSON.stringify(primerResult, null, 2)}</pre>}
              </div>
            )}
          </div>

          <div className="panel assistant-panel">
            <div className="panel-title">
              <Sparkles size={20} />
              <h2>Bioinformatics Interpretation</h2>
            </div>
            <textarea className="question" value={question} onChange={(event) => setQuestion(event.target.value)} />
            <div className="button-row">
              <button className="primary" onClick={askAssistant} disabled={busy || !analysis}><Sparkles size={18} /> Interpret</button>
              <button onClick={downloadReport} disabled={!analysis}><Download size={18} /> Download</button>
              <button onClick={copyReport} disabled={!analysis}><Clipboard size={18} /> Copy</button>
            </div>
            <pre>{aiText || "Run analysis, then generate a transparent rules-based interpretation. No API key, no external model, no clinical claims."}</pre>
          </div>
        </section>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}

function EmptyState() {
  return (
    <div className="empty-state">
      <Dna size={42} />
      <h2>Load a sequence to begin</h2>
      <p>BioSentinel AI runs locally in the browser and produces transparent research-use analysis without any API key.</p>
    </div>
  );
}
