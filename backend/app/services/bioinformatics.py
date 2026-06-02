from collections import Counter
from re import finditer

from fastapi import HTTPException

DNA_ALPHABET = set("ACGTNRYKMSWBDHV")
RNA_ALPHABET = set("ACGUNRYKMSWBDHV")
PROTEIN_ALPHABET = set("ABCDEFGHIKLMNPQRSTVWXYZ*")

CODON_TABLE = {
    "TTT": "F", "TTC": "F", "TTA": "L", "TTG": "L", "TCT": "S", "TCC": "S", "TCA": "S", "TCG": "S",
    "TAT": "Y", "TAC": "Y", "TAA": "*", "TAG": "*", "TGT": "C", "TGC": "C", "TGA": "*", "TGG": "W",
    "CTT": "L", "CTC": "L", "CTA": "L", "CTG": "L", "CCT": "P", "CCC": "P", "CCA": "P", "CCG": "P",
    "CAT": "H", "CAC": "H", "CAA": "Q", "CAG": "Q", "CGT": "R", "CGC": "R", "CGA": "R", "CGG": "R",
    "ATT": "I", "ATC": "I", "ATA": "I", "ATG": "M", "ACT": "T", "ACC": "T", "ACA": "T", "ACG": "T",
    "AAT": "N", "AAC": "N", "AAA": "K", "AAG": "K", "AGT": "S", "AGC": "S", "AGA": "R", "AGG": "R",
    "GTT": "V", "GTC": "V", "GTA": "V", "GTG": "V", "GCT": "A", "GCC": "A", "GCA": "A", "GCG": "A",
    "GAT": "D", "GAC": "D", "GAA": "E", "GAG": "E", "GGT": "G", "GGC": "G", "GGA": "G", "GGG": "G",
}

AA_WEIGHTS = {
    "A": 89.09, "R": 174.20, "N": 132.12, "D": 133.10, "C": 121.16, "Q": 146.15, "E": 147.13,
    "G": 75.07, "H": 155.16, "I": 131.17, "L": 131.17, "K": 146.19, "M": 149.21, "F": 165.19,
    "P": 115.13, "S": 105.09, "T": 119.12, "W": 204.23, "Y": 181.19, "V": 117.15,
}

RESTRICTION_ENZYMES = {
    "EcoRI": "GAATTC",
    "BamHI": "GGATCC",
    "HindIII": "AAGCTT",
    "NotI": "GCGGCCGC",
    "XhoI": "CTCGAG",
    "NdeI": "CATATG",
}


def parse_fasta(raw: str) -> tuple[str, str]:
    text = raw.strip()
    if not text:
        raise HTTPException(status_code=422, detail="Sequence input is empty.")
    if not text.startswith(">"):
        return "Untitled sequence", text
    lines = text.splitlines()
    header = lines[0][1:].strip()
    if not header:
        raise HTTPException(status_code=422, detail="FASTA header is empty.")
    if len(lines) == 1:
        raise HTTPException(status_code=422, detail="FASTA sequence is missing.")
    return header, "".join(line.strip() for line in lines[1:] if line.strip())


def clean_sequence(raw: str) -> str:
    return "".join(char for char in raw.upper() if char.isalpha() or char == "*")


def detect_type(seq: str) -> str:
    symbols = set(seq)
    if not seq:
        raise HTTPException(status_code=422, detail="Sequence has no readable biological symbols.")
    if symbols <= DNA_ALPHABET and "U" not in symbols:
        return "dna"
    if symbols <= RNA_ALPHABET and "U" in symbols:
        return "rna"
    if symbols <= PROTEIN_ALPHABET:
        return "protein"
    raise HTTPException(status_code=422, detail="Sequence contains unsupported symbols.")


def validate_sequence(seq: str, sequence_type: str, max_length: int) -> str:
    if len(seq) > max_length:
        raise HTTPException(status_code=413, detail=f"Sequence is too large. Limit is {max_length:,} symbols.")
    detected = detect_type(seq)
    resolved = detected if sequence_type == "auto" else sequence_type
    allowed = {"dna": DNA_ALPHABET, "rna": RNA_ALPHABET, "protein": PROTEIN_ALPHABET}.get(resolved)
    if not allowed:
        raise HTTPException(status_code=422, detail="Sequence type must be auto, dna, rna, or protein.")
    if not set(seq) <= allowed:
        raise HTTPException(status_code=422, detail=f"Input does not match selected {resolved.upper()} type.")
    return resolved


def gc_content(seq: str) -> float:
    bases = [base for base in seq if base in "ACGTU"]
    if not bases:
        return 0.0
    return round(((seq.count("G") + seq.count("C")) / len(bases)) * 100, 2)


def reverse_complement(seq: str, sequence_type: str) -> str | None:
    if sequence_type not in {"dna", "rna"}:
        return None
    table = str.maketrans("ACGTUNRYKMSWBDHVacgtunrykmswbdhv", "TGCAANYRMKSWVHDBtgcaanyrmkswvhdb")
    if sequence_type == "rna":
        table = str.maketrans("ACGUNRYKMSWBDHVacgunrykmswbdhv", "UGCANYRMKSWVHDBugcanyrmkswvhdb")
    return seq.translate(table)[::-1]


def translate(seq: str) -> str | None:
    dna = seq.replace("U", "T")
    if not set(dna) <= DNA_ALPHABET:
        return None
    return "".join(CODON_TABLE.get(dna[i:i + 3], "X") for i in range(0, len(dna) - 2, 3))


def find_orfs(seq: str, min_aa: int = 10) -> list[dict]:
    dna = seq.replace("U", "T")
    strands = [("+", dna)]
    rc = reverse_complement(dna, "dna")
    if rc:
        strands.append(("-", rc))
    orfs: list[dict] = []
    for strand, strand_seq in strands:
        for frame in range(3):
            aa = translate(strand_seq[frame:]) or ""
            start = 0
            while True:
                start = aa.find("M", start)
                if start == -1:
                    break
                stop_positions = [pos for pos in (aa.find("*", start),) if pos != -1]
                stop = min(stop_positions) if stop_positions else len(aa)
                peptide = aa[start:stop]
                if len(peptide) >= min_aa:
                    orfs.append({
                        "strand": strand,
                        "frame": frame + 1,
                        "start_nt": frame + start * 3 + 1,
                        "end_nt": frame + stop * 3 + 3,
                        "length_aa": len(peptide),
                        "peptide_preview": peptide[:80],
                    })
                start += 1
    return sorted(orfs, key=lambda item: item["length_aa"], reverse=True)[:25]


def primer_qc(primer: str) -> dict:
    seq = clean_sequence(primer).replace("U", "T")
    if not seq:
        return {"provided": False}
    warnings = []
    if not set(seq) <= DNA_ALPHABET:
        warnings.append("Primer contains non-DNA symbols.")
    if not 18 <= len(seq) <= 30:
        warnings.append("Common PCR primers are often 18-30 nt; verify design constraints.")
    gc = gc_content(seq)
    if gc < 35 or gc > 65:
        warnings.append("GC percentage is outside a common 35-65% screening range.")
    if any(base * 5 in seq for base in "ACGT"):
        warnings.append("Homopolymer run detected; check for mispriming risk.")
    tm = 2 * (seq.count("A") + seq.count("T")) + 4 * (seq.count("G") + seq.count("C"))
    return {"provided": True, "sequence": seq, "length": len(seq), "gc_percent": gc, "tm_wallace_c": tm, "warnings": warnings}


def restriction_sites(seq: str) -> list[dict]:
    dna = seq.replace("U", "T")
    hits = []
    for enzyme, motif in RESTRICTION_ENZYMES.items():
        for match in finditer(motif, dna):
            hits.append({"enzyme": enzyme, "motif": motif, "position": match.start() + 1})
    return hits


def motif_search(seq: str, motif: str) -> dict:
    cleaned_seq = clean_sequence(seq)
    cleaned_motif = clean_sequence(motif)
    if not cleaned_motif:
        raise HTTPException(status_code=422, detail="Motif is empty after cleaning.")
    return {
        "motif": cleaned_motif,
        "positions": [match.start() + 1 for match in finditer(cleaned_motif, cleaned_seq)],
    }


def analyze_sequence(raw: str, sequence_type: str = "auto", title: str = "Untitled sequence", max_length: int = 250_000) -> dict:
    fasta_title, parsed = parse_fasta(raw)
    seq = clean_sequence(parsed)
    resolved_type = validate_sequence(seq, sequence_type, max_length)
    count_map = dict(sorted(Counter(seq).items()))
    result = {
        "title": title if title != "Untitled sequence" else fasta_title,
        "sequence_type": resolved_type,
        "length": len(seq),
        "composition": count_map,
        "gc_percent": gc_content(seq) if resolved_type in {"dna", "rna"} else None,
        "ambiguous_symbols": sum(count for base, count in count_map.items() if base not in "ACGTU" and resolved_type in {"dna", "rna"}),
        "limitations": [
            "This analysis is for research and education only, not for clinical use.",
            "No organism, gene function, disease association, or pathogen identity is inferred without external validated evidence.",
        ],
    }
    if resolved_type in {"dna", "rna"}:
        result.update({
            "reverse_complement": reverse_complement(seq, resolved_type),
            "transcription": seq.replace("T", "U") if resolved_type == "dna" else None,
            "translation": translate(seq),
            "orfs": find_orfs(seq),
            "restriction_sites": restriction_sites(seq),
        })
    else:
        result["molecular_weight_da"] = round(sum(AA_WEIGHTS.get(aa, 0) for aa in seq), 2)
    return result
