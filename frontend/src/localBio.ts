export type AnalysisResult = {
  title: string;
  sequence_type: string;
  length: number;
  gc_percent?: number | null;
  ambiguous_symbols?: number;
  composition: Record<string, number>;
  translation?: string | null;
  reverse_complement?: string | null;
  transcription?: string | null;
  orfs?: Array<Record<string, unknown>>;
  restriction_sites?: Array<Record<string, unknown>>;
  limitations: string[];
};

const dnaAlphabet = new Set("ACGTNRYKMSWBDHV".split(""));
const rnaAlphabet = new Set("ACGUNRYKMSWBDHV".split(""));
const proteinAlphabet = new Set("ABCDEFGHIKLMNPQRSTVWXYZ*".split(""));

const codons: Record<string, string> = {
  TTT: "F", TTC: "F", TTA: "L", TTG: "L", TCT: "S", TCC: "S", TCA: "S", TCG: "S",
  TAT: "Y", TAC: "Y", TAA: "*", TAG: "*", TGT: "C", TGC: "C", TGA: "*", TGG: "W",
  CTT: "L", CTC: "L", CTA: "L", CTG: "L", CCT: "P", CCC: "P", CCA: "P", CCG: "P",
  CAT: "H", CAC: "H", CAA: "Q", CAG: "Q", CGT: "R", CGC: "R", CGA: "R", CGG: "R",
  ATT: "I", ATC: "I", ATA: "I", ATG: "M", ACT: "T", ACC: "T", ACA: "T", ACG: "T",
  AAT: "N", AAC: "N", AAA: "K", AAG: "K", AGT: "S", AGC: "S", AGA: "R", AGG: "R",
  GTT: "V", GTC: "V", GTA: "V", GTG: "V", GCT: "A", GCC: "A", GCA: "A", GCG: "A",
  GAT: "D", GAC: "D", GAA: "E", GAG: "E", GGT: "G", GGC: "G", GGA: "G", GGG: "G"
};

const enzymes: Record<string, string> = {
  EcoRI: "GAATTC",
  BamHI: "GGATCC",
  HindIII: "AAGCTT",
  NotI: "GCGGCCGC",
  XhoI: "CTCGAG",
  NdeI: "CATATG"
};

function parseFasta(raw: string) {
  const text = raw.trim();
  if (!text) throw new Error("Sequence input is empty.");
  if (!text.startsWith(">")) return { title: "Workspace sequence", sequence: text };
  const lines = text.split(/\r?\n/);
  const title = lines[0].slice(1).trim() || "FASTA sequence";
  const sequence = lines.slice(1).map((line) => line.trim()).filter(Boolean).join("");
  if (!sequence) throw new Error("FASTA sequence is missing.");
  return { title, sequence };
}

function clean(raw: string) {
  return raw.toUpperCase().replace(/[^A-Z*]/g, "");
}

function subset(symbols: Set<string>, alphabet: Set<string>) {
  return [...symbols].every((symbol) => alphabet.has(symbol));
}

function detect(sequence: string) {
  const symbols = new Set(sequence.split(""));
  if (!sequence) throw new Error("Sequence has no readable biological symbols.");
  if (subset(symbols, dnaAlphabet) && !symbols.has("U")) return "dna";
  if (subset(symbols, rnaAlphabet) && symbols.has("U")) return "rna";
  if (subset(symbols, proteinAlphabet)) return "protein";
  throw new Error("Sequence contains unsupported symbols.");
}

function gc(sequence: string) {
  const bases = sequence.split("").filter((base) => "ACGTU".includes(base));
  if (!bases.length) return 0;
  const gcCount = sequence.split("").filter((base) => base === "G" || base === "C").length;
  return Number(((gcCount / bases.length) * 100).toFixed(2));
}

function counts(sequence: string) {
  return sequence.split("").reduce<Record<string, number>>((acc, symbol) => {
    acc[symbol] = (acc[symbol] || 0) + 1;
    return acc;
  }, {});
}

function reverseComplement(sequence: string, type: string) {
  if (!["dna", "rna"].includes(type)) return null;
  const dnaMap: Record<string, string> = { A: "T", C: "G", G: "C", T: "A", U: "A", N: "N", R: "Y", Y: "R", K: "M", M: "K", S: "S", W: "W", B: "V", D: "H", H: "D", V: "B" };
  const rnaMap: Record<string, string> = { ...dnaMap, A: "U" };
  const map: Record<string, string> = type === "rna" ? rnaMap : dnaMap;
  return sequence.split("").reverse().map((base) => map[base] || "N").join("");
}

function translate(sequence: string) {
  const dna = sequence.replace(/U/g, "T");
  if (!subset(new Set(dna.split("")), dnaAlphabet)) return null;
  let protein = "";
  for (let index = 0; index < dna.length - 2; index += 3) {
    protein += codons[dna.slice(index, index + 3)] || "X";
  }
  return protein;
}

function orfs(sequence: string) {
  const dna = sequence.replace(/U/g, "T");
  const strands = [["+", dna], ["-", reverseComplement(dna, "dna") || ""]];
  const found: Array<Record<string, unknown>> = [];
  for (const [strand, strandSequence] of strands) {
    for (let frame = 0; frame < 3; frame += 1) {
      const protein = translate(strandSequence.slice(frame)) || "";
      let start = protein.indexOf("M");
      while (start !== -1) {
        const stop = protein.indexOf("*", start);
        const end = stop === -1 ? protein.length : stop;
        const peptide = protein.slice(start, end);
        if (peptide.length >= 5) {
          found.push({
            strand,
            frame: frame + 1,
            start_nt: frame + start * 3 + 1,
            end_nt: frame + end * 3 + 3,
            length_aa: peptide.length,
            peptide_preview: peptide.slice(0, 80)
          });
        }
        start = protein.indexOf("M", start + 1);
      }
    }
  }
  return found.sort((a, b) => Number(b.length_aa) - Number(a.length_aa)).slice(0, 25);
}

function restrictionSites(sequence: string) {
  const dna = sequence.replace(/U/g, "T");
  const hits: Array<Record<string, unknown>> = [];
  for (const [enzyme, motif] of Object.entries(enzymes)) {
    let index = dna.indexOf(motif);
    while (index !== -1) {
      hits.push({ enzyme, motif, position: index + 1 });
      index = dna.indexOf(motif, index + 1);
    }
  }
  return hits;
}

export function analyzeSequence(raw: string, selectedType = "auto"): AnalysisResult {
  const parsed = parseFasta(raw);
  const sequence = clean(parsed.sequence);
  if (sequence.length > 250000) throw new Error("Sequence is too large. Limit is 250,000 symbols.");
  const detected = detect(sequence);
  const type = selectedType === "auto" ? detected : selectedType;
  const alphabet = type === "dna" ? dnaAlphabet : type === "rna" ? rnaAlphabet : proteinAlphabet;
  if (!subset(new Set(sequence.split("")), alphabet)) throw new Error(`Input does not match selected ${type.toUpperCase()} type.`);
  const result: AnalysisResult = {
    title: parsed.title,
    sequence_type: type,
    length: sequence.length,
    composition: counts(sequence),
    gc_percent: ["dna", "rna"].includes(type) ? gc(sequence) : null,
    ambiguous_symbols: ["dna", "rna"].includes(type) ? sequence.split("").filter((base) => !"ACGTU".includes(base)).length : 0,
    limitations: [
      "Research and education use only.",
      "Not for clinical use.",
      "No organism, disease, pathogen, or gene-function claim is inferred."
    ]
  };
  if (["dna", "rna"].includes(type)) {
    result.reverse_complement = reverseComplement(sequence, type);
    result.transcription = type === "dna" ? sequence.replace(/T/g, "U") : null;
    result.translation = translate(sequence);
    result.orfs = orfs(sequence);
    result.restriction_sites = restrictionSites(sequence);
  }
  return result;
}

export function primerQc(primer: string) {
  const sequence = clean(primer).replace(/U/g, "T");
  if (!sequence) return { provided: false };
  const warnings = [];
  const gcPercent = gc(sequence);
  if (!subset(new Set(sequence.split("")), dnaAlphabet)) warnings.push("Primer contains non-DNA symbols.");
  if (sequence.length < 18 || sequence.length > 30) warnings.push("Common PCR primers are often 18-30 nt; verify design constraints.");
  if (gcPercent < 35 || gcPercent > 65) warnings.push("GC percentage is outside a common 35-65% screening range.");
  if (/(A{5,}|C{5,}|G{5,}|T{5,})/.test(sequence)) warnings.push("Homopolymer run detected; check for mispriming risk.");
  const tm = 2 * (sequence.match(/[AT]/g) || []).length + 4 * (sequence.match(/[GC]/g) || []).length;
  return { provided: true, sequence, length: sequence.length, gc_percent: gcPercent, tm_wallace_c: tm, warnings };
}

export function interpretAnalysis(analysis: AnalysisResult, question: string) {
  const flags = [];
  if (analysis.sequence_type === "dna" || analysis.sequence_type === "rna") {
    if ((analysis.gc_percent || 0) < 30) flags.push("Low GC content may affect amplification, assembly, or organism-specific expectations.");
    if ((analysis.gc_percent || 0) > 70) flags.push("High GC content may require extra care in PCR and sequencing workflows.");
    if ((analysis.ambiguous_symbols || 0) > 0) flags.push(`${analysis.ambiguous_symbols} ambiguous symbols were detected; confirm input quality.`);
    if (!analysis.orfs?.length) flags.push("No ORF above the screening threshold was found; check frame, strand, and sequence completeness.");
  }
  if (!flags.length) flags.push("No major screening flags were found from the calculated metrics.");
  return [
    `Question reviewed: ${question}`,
    "",
    "Consensus interpretation:",
    `The input looks like ${analysis.sequence_type.toUpperCase()} with ${analysis.length.toLocaleString()} symbols. This interpretation is based only on calculated sequence statistics.`,
    "",
    "Quality flags:",
    ...flags.map((flag) => `- ${flag}`),
    "",
    "Practical next steps:",
    "- Verify the sequence source, orientation, and expected alphabet.",
    "- Compare against a validated reference or curated database before making biological claims.",
    "- For wet-lab use, validate primers and amplicons with a dedicated primer-design workflow.",
    "",
    "Limitations:",
    "- This is a rules-based bioinformatics assistant, not a trained clinical model.",
    "- It does not identify organisms, diagnose disease, or infer gene function.",
    "- Not for clinical use."
  ].join("\n");
}
