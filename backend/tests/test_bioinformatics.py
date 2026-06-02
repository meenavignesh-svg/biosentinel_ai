from app.services.bioinformatics import analyze_sequence, motif_search, primer_qc


def test_analyze_dna_sequence():
    result = analyze_sequence(">sample\nATGGCCATTGTAATGGGCCGCTGAAAGGGTGCCCGATAG")
    assert result["sequence_type"] == "dna"
    assert result["length"] == 39
    assert result["gc_percent"] > 40
    assert result["translation"].startswith("MAIVM")
    assert "not for clinical use" in " ".join(result["limitations"]).lower()


def test_primer_qc_reports_basic_metrics():
    result = primer_qc("ATGGCCATTGTAAAGGGT")
    assert result["provided"] is True
    assert result["length"] == 18
    assert result["tm_wallace_c"] > 0


def test_motif_search_positions_are_one_based():
    result = motif_search("ATGATGATG", "ATG")
    assert result["positions"] == [1, 4, 7]
