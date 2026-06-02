import { useMemo, useState } from "react";
import { Activity, Download, FileUp, LogOut, Microscope, Sparkles } from "lucide-react";
import { apiRequest, authenticate, AuthMode } from "./api";

type AnalysisResult = {
  title: string;
  sequence_type: string;
  length: number;
  gc_percent?: number | null;
  ambiguous_symbols?: number;
  composition: Record<string, number>;
  translation?: string | null;
  reverse_complement?: string | null;
  orfs?: Array<Record<string, unknown>>;
  restriction_sites?: Array<Record<string, unknown>>;
  limitations: string[];
};

const sample = `>research_sample
ATGGCCATTGTAATGGGCCGCTGAAAGGGTGCCCGATAG`;

export default function App() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState(() => localStorage.getItem("biosentinel_token") || "");
  const [sequence, setSequence] = useState(sample);
  const [sequenceType, setSequenceType] = useState("auto");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [question, setQuestion] = useState("Explain the key quality checks and practical next validation steps.");
  const [aiText, setAiText] = useState("");
  const [forwardPrimer, setForwardPrimer] = useState("");
  const [reversePrimer, setReversePrimer] = useState("");
  const [primerResult, setPrimerResult] = useState<unknown>(null);
  const [message, setMessage] = useState("Ready for research-use sequence analysis.");
  const [busy, setBusy] = useState(false);

  const signedIn = Boolean(token);
  const compositionRows = useMemo(() => Object.entries(analysis?.composition || {}), [analysis]);

  async function handleAuth() {
    setBusy(true);
    try {
      const data = await authenticate(mode, email, password);
      localStorage.setItem("biosentinel_token", data.access_token);
      setToken(data.access_token);
      setMessage("Signed in. Backend AI and analysis tools are ready.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Login failed.");
    } finally {
      setBusy(false);
    }
  }

  async function analyzeSequence() {
    setBusy(true);
    setAiText("");
    try {
      const data = await apiRequest<{ result: AnalysisResult }>("/api/analyze/sequence", {
        method: "POST",
        body: JSON.stringify({ sequence, sequence_type: sequenceType, title: "Workspace sequence" })
      }, token);
      setAnalysis(data.result);
      setMessage("Analysis complete and stored in your account history.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Analysis failed.");
    } finally {
      setBusy(false);
    }
  }

  async function askAi() {
    if (!analysis) {
      setMessage("Run sequence analysis first, then ask AI to interpret the calculated result.");
      return;
    }
    setBusy(true);
    try {
      const data = await apiRequest<{ interpretation: string }>("/api/ai/interpret", {
        method: "POST",
        body: JSON.stringify({ analysis, question })
      }, token);
      setAiText(data.interpretation);
      setMessage("AI interpretation returned from the secure backend.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AI interpretation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function checkPrimers() {
    setBusy(true);
    try {
      const data = await apiRequest("/api/analyze/primers", {
        method: "POST",
        body: JSON.stringify({ forward_primer: forwardPrimer, reverse_primer: reversePrimer })
      }, token);
      setPrimerResult(data);
      setMessage("Primer QC complete.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Primer QC failed.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadFile(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const data = await apiRequest<{ analysis: AnalysisResult }>("/api/files/upload", { method: "POST", body: form }, token);
      setAnalysis(data.analysis);
      setMessage("File uploaded and analyzed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function createReport() {
    if (!analysis) return;
    const data = await apiRequest<{ report_id: number }>("/api/reports", {
      method: "POST",
      body: JSON.stringify({ title: analysis.title, analysis, ai_interpretation: aiText || null })
    }, token);
    window.open(`${import.meta.env.VITE_API_URL || "http://localhost:8000"}/api/reports/${data.report_id}?format=html`, "_blank");
  }

  if (!signedIn) {
    return (
      <main className="auth-shell">
        <section className="auth-panel">
          <Microscope size={36} />
          <h1>BioSentinel AI</h1>
          <p>Secure bioinformatics analysis with backend-owned AI interpretation. Research use only, not for clinical use.</p>
          <div className="toggle">
            <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Login</button>
            <button className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>Register</button>
          </div>
          <input placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} />
          <input placeholder="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          <button className="primary" disabled={busy} onClick={handleAuth}>{busy ? "Working..." : mode === "login" ? "Login" : "Create account"}</button>
          <p className="status">{message}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Production bioinformatics MVP</p>
          <h1>BioSentinel AI</h1>
        </div>
        <button className="icon-button" onClick={() => { localStorage.removeItem("biosentinel_token"); setToken(""); }}>
          <LogOut size={18} /> Logout
        </button>
      </header>

      <section className="workspace">
        <aside className="panel controls">
          <label>Sequence type
            <select value={sequenceType} onChange={(event) => setSequenceType(event.target.value)}>
              <option value="auto">Auto detect</option>
              <option value="dna">DNA</option>
              <option value="rna">RNA</option>
              <option value="protein">Protein</option>
            </select>
          </label>
          <label>FASTA or sequence
            <textarea value={sequence} onChange={(event) => setSequence(event.target.value)} />
          </label>
          <button className="primary" disabled={busy} onClick={analyzeSequence}><Activity size={18} /> Analyze sequence</button>
          <label className="upload">
            <FileUp size={18} /> Upload FASTA
            <input type="file" accept=".fa,.fasta,.txt" onChange={(event) => uploadFile(event.target.files?.[0])} />
          </label>
          <div className="primer-grid">
            <input placeholder="Forward primer" value={forwardPrimer} onChange={(event) => setForwardPrimer(event.target.value)} />
            <input placeholder="Reverse primer" value={reversePrimer} onChange={(event) => setReversePrimer(event.target.value)} />
          </div>
          <button onClick={checkPrimers} disabled={busy}>Check primers</button>
          <p className="status">{message}</p>
        </aside>

        <section className="results">
          <div className="panel metrics">
            <Metric label="Type" value={analysis?.sequence_type || "-"} />
            <Metric label="Length" value={analysis?.length?.toLocaleString() || "-"} />
            <Metric label="GC" value={analysis?.gc_percent == null ? "-" : `${analysis.gc_percent}%`} />
            <Metric label="ORFs" value={analysis?.orfs?.length?.toString() || "0"} />
          </div>

          <div className="panel">
            <h2>Calculated Results</h2>
            {!analysis && <p>Run an analysis to see validated sequence statistics.</p>}
            {analysis && (
              <>
                <div className="table">
                  {compositionRows.map(([key, value]) => <span key={key}>{key}: {String(value)}</span>)}
                </div>
                <h3>Open reading frames</h3>
                <pre>{JSON.stringify(analysis.orfs || [], null, 2)}</pre>
                <h3>Restriction sites</h3>
                <pre>{JSON.stringify(analysis.restriction_sites || [], null, 2)}</pre>
                <h3>Limitations</h3>
                <ul>{analysis.limitations.map((item) => <li key={item}>{item}</li>)}</ul>
              </>
            )}
          </div>

          <div className="panel">
            <h2>AI Interpretation</h2>
            <textarea className="question" value={question} onChange={(event) => setQuestion(event.target.value)} />
            <div className="button-row">
              <button className="primary" onClick={askAi} disabled={busy || !analysis}><Sparkles size={18} /> Ask secure AI</button>
              <button onClick={createReport} disabled={!analysis}><Download size={18} /> Report</button>
            </div>
            <pre>{aiText || "AI will only interpret calculated backend results. It will not invent gene names, organisms, diseases, or clinical claims."}</pre>
          </div>

          {primerResult !== null && <div className="panel"><h2>Primer QC</h2><pre>{JSON.stringify(primerResult, null, 2)}</pre></div>}
        </section>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}
