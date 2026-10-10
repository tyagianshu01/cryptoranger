"""
routers/analysis.py
────────────────────────────────────────────────────────────────────────────
ChainTrace Analytics — Forensic Endpoints (v2.1)
  POST /vasp-offramps       → Directed Dijkstra & Exposure analysis (Section 5.5)
  POST /peeling-heuristics  → Chain-level peel & receive->forward latency
  POST /generate-dossier    → Court-ready neutral PDF dossier (ReportLab)
"""

from __future__ import annotations

import hashlib
import io
from collections import defaultdict, deque
from datetime import datetime
from typing import Any, Dict, List, Set

import networkx as nx
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from config import KNOWN_VASPS, NEO4J_PASSWORD, NEO4J_URI, NEO4J_USER
from db_connect import get_db_driver, get_networkx_from_neo4j
from normalize import DUST_ETH, get_label_info, is_dust, wei_to_eth, normalize_address
from scoring.offramp import evaluate_off_ramp_leads
from scoring.patterns import compute_forwarding_latency, detect_peel_chains
from scoring.taint import compute_forward_taint

router = APIRouter()


# ── Request schemas ──────────────────────────────────────────────────────────

class WalletRequest(BaseModel):
    address: str

class DossierRequest(BaseModel):
    address: str
    case_id: str = "CASE-0000"
    officer_name: str = "Lead Forensic Analyst"
    case_notes: str = ""


# ── Shared helpers ───────────────────────────────────────────────────────────

def _fetch_subgraph_transfers(address: str, max_hops: int = 5) -> List[Dict[str, Any]]:
    """Fetches non-dust and token transfers up to max_hops from address (ETH or Solana)."""
    from neo4j import GraphDatabase
    is_sol = not address.startswith("0x") and 32 <= len(address) <= 44

    if is_sol:
        cypher = """
        MATCH (s:Account)-[r:TRANSFERRED]->(recv:Account)
        RETURN
            s.address AS sender,
            recv.address AS receiver,
            r.amount AS amount,
            r.token AS token_symbol,
            r.signature AS hash,
            toString(r.timestamp) AS ts
        LIMIT 2000
        """
    else:
        cypher = """
        MATCH (s:Wallet)-[:SENT|SENT_TOKEN]->(tx)-[:TO|TOKEN_TO]->(r:Wallet)
        RETURN
            s.address AS sender,
            r.address AS receiver,
            tx.value_eth AS value_eth,
            tx.value_token AS value_token,
            tx.amount AS amount,
            tx.token_symbol AS token_symbol,
            tx.hash AS hash,
            toString(tx.timestamp) AS ts
        LIMIT 2000
        """
    rows: List[Dict[str, Any]] = []
    try:
        driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
        with driver.session() as session:
            result = session.run(cypher)
            for rec in result:
                if is_sol:
                    s_addr = str(rec["sender"] or "").strip()
                    r_addr = str(rec["receiver"] or "").strip()
                    token = str(rec["token_symbol"] or "SOL").upper()
                    amt = float(rec["amount"] or 0.0)
                    rows.append({
                        "source": s_addr,
                        "target": r_addr,
                        "amount": amt,
                        "assetType": "sol" if token == "SOL" else "token",
                        "symbol": token,
                        "txHash": rec["hash"] or "",
                        "timestamp": rec["ts"] or "",
                        "blockTimestamp": rec["ts"] or "",
                    })
                else:
                    s_addr = str(rec["sender"] or "").lower().strip()
                    r_addr = str(rec["receiver"] or "").lower().strip()
                    symbol = str(rec["token_symbol"] or "ETH").upper()
                    is_eth = symbol == "ETH"

                    if is_eth:
                        val_eth = rec["value_eth"]
                        if val_eth is None:
                            val_eth = wei_to_eth(rec["amount"] or 0)
                        amt = float(val_eth)
                    else:
                        amt = float(rec["value_token"] or rec["amount"] or 0.0)

                    rows.append({
                        "source": s_addr,
                        "target": r_addr,
                        "amount": amt,
                        "assetType": "eth" if is_eth else "token",
                        "symbol": symbol,
                        "txHash": rec["hash"] or "",
                        "timestamp": rec["ts"] or "",
                        "blockTimestamp": rec["ts"] or "",
                    })
        driver.close()
    except Exception as e:
        print(f"[analysis] subgraph transfer query error: {e}")
    return rows


# ══════════════════════════════════════════════════════════════════════════════
# ENDPOINT 1 — VASP Offramps (Section 5.5 Specification)
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/vasp-offramps")
def vasp_offramps(req: WalletRequest):
    address = normalize_address(req.address)
    if not address:
        return {"offRamps": [], "vasps": [], "error": "No address provided"}


    transfers = _fetch_subgraph_transfers(address, max_hops=5)
    if not transfers:
        return {"offRamps": [], "vasps": [], "offRampStatus": "no off-ramp found within trace limits"}

    # Compute forward taint
    taint_map = compute_forward_taint(origin_set={address}, transfers=transfers)

    # Detect peel chains for cash-out peel tagging
    _, peel_chains = detect_peel_chains(transfers)

    # Run Stage 5 off-ramp execution
    results = evaluate_off_ramp_leads({address}, transfers, taint_map, peel_chains)

    # Backwards-compatible "vasps" list for existing UI panels
    vasps_compat = []
    for r in results.get("offRamps", []):
        vasps_compat.append({
            "exchange": r["entity"],
            "address": r["address"],
            "depositAddress": r.get("depositAddress"),
            "hops": r["hops"],
            "path": r["path"],
            "total_eth": r["taintedEth"],
            "confidence": r["conf"],
            "risk_level": r["severity"],
            "cashOutPeel": r["cashOutPeel"],
        })

    return {
        "offRamps": results.get("offRamps", []),
        "offRampStatus": results.get("offRampStatus", "no off-ramp found within trace limits"),
        "vasps": vasps_compat,
        "total_found": len(results.get("offRamps", [])),
    }


# ══════════════════════════════════════════════════════════════════════════════
# ENDPOINT 2 — Peeling Heuristics & Forwarding Latency
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/peeling-heuristics")
def peeling_heuristics(req: WalletRequest):
    address = normalize_address(req.address)
    if not address:
        return {"peel_flags": [], "velocity_flags": [], "peel_chains": [], "error": "No address provided"}

    transfers = _fetch_subgraph_transfers(address, max_hops=5)
    if not transfers:
        return {"peel_flags": [], "velocity_flags": [], "peel_chains": []}


    peel_wallets, qualifying_chains = detect_peel_chains(transfers)
    fwd_info = compute_forwarding_latency(transfers)

    # Convert to frontend-compatible flags
    peel_flags: List[Dict[str, Any]] = []
    for c in qualifying_chains:
        peel_flags.append({
            "address": c["start"],
            "end_address": c["end"],
            "hops": c["hops"],
            "nodes": c["nodes"],
            "severity": "CRITICAL" if c["cash_out_peel"] else "CONFIRMED",
            "cash_out_peel": c["cash_out_peel"],
        })

    velocity_flags: List[Dict[str, Any]] = []
    for w, info in fwd_info.items():
        if info.get("fast") == 1:
            velocity_flags.append({
                "address": w,
                "hold_seconds": round(info.get("median_latency_seconds", 0), 1),
                "matched_flows": info.get("matched_flows", 0),
                "severity": "CRITICAL" if info.get("very_fast") == 1 else "FLAGGED",
            })

    return {
        "peel_chains": qualifying_chains,
        "peel_flags": peel_flags,
        "velocity_flags": velocity_flags,
        "total_peel": len(peel_flags),
        "total_velocity": len(velocity_flags),
    }


# ══════════════════════════════════════════════════════════════════════════════
# ENDPOINT 3 — Generate Evidence Dossier PDF (Neutral Blockchain Analytics)
# ══════════════════════════════════════════════════════════════════════════════

def _build_pdf(
    address: str,
    case_id: str,
    officer: str,
    notes: str,
    off_ramps: list,
    peel_chains: list,
    velocity_flags: list,
    transactions: list,
) -> bytes:
    """Builds a neutral, professional blockchain analytics dossier using ReportLab."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import cm
    from reportlab.platypus import (
        HRFlowable,
        Paragraph,
        SimpleDocTemplate,
        Spacer,
        Table,
        TableStyle,
    )

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        rightMargin=1.8 * cm,
        leftMargin=1.8 * cm,
        topMargin=1.8 * cm,
        bottomMargin=1.8 * cm,
        title=f"Forensic Investigation Dossier — {case_id}",
    )

    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        "DossierTitle", parent=styles["Heading1"],
        fontSize=15, spaceAfter=2, textColor=colors.HexColor("#0f0f0e"), fontName="Helvetica-Bold",
    )
    subtitle_style = ParagraphStyle(
        "DossierSubtitle", parent=styles["Normal"],
        fontSize=9, textColor=colors.HexColor("#60605f"), fontName="Helvetica",
    )
    heading2 = ParagraphStyle(
        "H2", parent=styles["Heading2"],
        fontSize=11, spaceBefore=8, spaceAfter=4, textColor=colors.HexColor("#0f0f0e"), fontName="Helvetica-Bold",
    )
    mono = ParagraphStyle(
        "Mono", parent=styles["Normal"],
        fontName="Courier", fontSize=8, leading=11, textColor=colors.HexColor("#171717"),
    )
    normal = ParagraphStyle(
        "NormalText", parent=styles["Normal"],
        fontSize=8.5, leading=12, textColor=colors.HexColor("#171717"),
    )

    # Chain of custody hash
    raw_payload = f"{address}{case_id}{officer}{datetime.utcnow().date()}{off_ramps}{peel_chains}{velocity_flags}"
    coc_hash = hashlib.sha256(raw_payload.encode()).hexdigest().upper()

    def make_table_style(header_bg=colors.HexColor("#0f0f0e")):
        return TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), header_bg),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#fafaf9")),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 8),
            ("FONTNAME", (0, 1), (-1, -1), "Courier"),
            ("FONTSIZE", (0, 1), (-1, -1), 7.5),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f1f1f0")]),
            ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#e2e2e1")),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ])

    def trunc(s: str, n: int = 24) -> str:
        s = str(s)
        return s[:n] + "…" if len(s) > n else s

    story = []
    hr = HRFlowable(width="100%", thickness=1, color=colors.HexColor("#e2e2e1"))

    # Header
    story.append(Paragraph("CHAINTRACE ANALYTICS", title_style))
    story.append(Paragraph("Blockchain Transaction Intelligence & Forensic Audit Dossier", subtitle_style))
    story.append(Spacer(1, 4))
    story.append(hr)
    story.append(Spacer(1, 8))

    # Case Metadata
    story.append(Paragraph("1. INVESTIGATION METADATA", heading2))
    meta_data = [
        ["Field", "Value"],
        ["Case Reference", case_id],
        ["Analyst / Investigator", officer],
        ["Traced Root Wallet", address],
        ["Audit Timestamp", datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")],
        ["Evidence SHA-256 Digest", trunc(coc_hash, 50)],
        ["Investigation Notes", notes or "No notes attached"],
    ]
    t_meta = Table(meta_data, colWidths=[5 * cm, 12.4 * cm])
    t_meta.setStyle(make_table_style())
    story.append(t_meta)
    story.append(Spacer(1, 10))

    # Off-ramp Destinations
    is_sol = not address.startswith("0x") and 32 <= len(address) <= 44
    currency = "SOL" if is_sol else "ETH"

    story.append(Paragraph("2. REGULATED OFF-RAMP LEADS (FREEZE & SUBPOENA TARGETS)", heading2))
    if off_ramps:
        off_data = [["Entity", "Type", "Address / Deposit", "Hops", f"Tainted {currency}", "Severity"]]
        for o in off_ramps:
            addr_display = o.get("depositAddress") or o.get("address", "—")
            off_data.append([
                trunc(o.get("entity", "—"), 18),
                o.get("confidence_label", "confirmed"),
                trunc(addr_display, 20),
                str(o.get("hops", "—")),
                f"{float(o.get('taintedEth', 0.0)):.4f}",
                o.get("severity", "MEDIUM"),
            ])
        t_off = Table(off_data, colWidths=[3.5 * cm, 2.2 * cm, 4.7 * cm, 1.5 * cm, 2.5 * cm, 3 * cm])
        t_off.setStyle(make_table_style(colors.HexColor("#0f0f0e")))
        story.append(t_off)
    else:
        story.append(Paragraph("No regulated exchange off-ramps detected within current trace boundaries.", normal))
    story.append(Spacer(1, 10))

    # Heuristic Behavioral Evidence
    story.append(Paragraph("3. HEURISTIC & PATTERN EVIDENCE", heading2))
    story.append(Paragraph(f"• <b>Chain-level Peeling Paths:</b> {len(peel_chains)} detected", normal))
    if peel_chains:
        peel_data = [["Chain Start", "Chain End", "Hops", "Cash-Out Peel?"]]
        for p in peel_chains[:10]:
            nodes = p.get("nodes", [])
            start_n = nodes[0] if nodes else p.get("start", "—")
            end_n = nodes[-1] if nodes else p.get("end", "—")
            peel_data.append([
                trunc(start_n, 20),
                trunc(end_n, 20),
                str(p.get("hops", len(nodes) - 1 if nodes else 0)),
                "YES" if p.get("cash_out_peel") else "No",
            ])
        t_peel = Table(peel_data, colWidths=[5.5 * cm, 5.5 * cm, 2.4 * cm, 4 * cm])
        t_peel.setStyle(make_table_style(colors.HexColor("#262625")))
        story.append(t_peel)
        story.append(Spacer(1, 6))

    story.append(Paragraph(f"• <b>Rapid Forwarding Latency:</b> {len(velocity_flags)} flows below 180s threshold", normal))
    if velocity_flags:
        v_data = [["Wallet Address", "Median Latency", "Matched Flows", "Severity"]]
        for v in velocity_flags[:10]:
            v_data.append([
                trunc(v.get("address", "—"), 26),
                f"{v.get('hold_seconds', 0)}s",
                str(v.get("matched_flows", 0)),
                v.get("severity", "FLAGGED"),
            ])
        t_v = Table(v_data, colWidths=[6.5 * cm, 3.5 * cm, 3.4 * cm, 4 * cm])
        t_v.setStyle(make_table_style(colors.HexColor("#262625")))
        story.append(t_v)

    story.append(Spacer(1, 10))

    # Transaction ledger excerpt
    story.append(Paragraph("4. TRANSACTION AUDIT LOG (TOP EXCERPT)", heading2))
    if transactions:
        tx_data = [["#", "From", "To", f"Amount ({currency})", "Timestamp"]]
        for i, tx in enumerate(transactions[:25], 1):
            tx_data.append([
                str(i),
                trunc(tx.get("source", tx.get("from", "—")), 18),
                trunc(tx.get("target", tx.get("to", "—")), 18),
                f"{float(tx.get('amount', tx.get('value_eth', 0.0))):.4f}",
                trunc(str(tx.get("timestamp", "—")), 18),
            ])
        t_tx = Table(tx_data, colWidths=[0.8 * cm, 4.8 * cm, 4.8 * cm, 3 * cm, 4 * cm])
        t_tx.setStyle(make_table_style(colors.HexColor("#0f0f0e")))
        story.append(t_tx)
    else:
        story.append(Paragraph("No ledger transactions recorded.", normal))

    story.append(Spacer(1, 14))
    story.append(hr)
    story.append(Spacer(1, 4))
    story.append(Paragraph(
        f"ChainTrace Analytics Engine (v2.1) · Calibrated LightGBM ML + Forward Haircut Taint · Evidence SHA: {coc_hash[:32]}…",
        subtitle_style,
    ))

    doc.build(story)
    return buf.getvalue()


@router.post("/generate-dossier")
def generate_dossier(req: DossierRequest):
    address = normalize_address(req.address)


    # Gather data internally
    offramp_res = vasp_offramps(WalletRequest(address=address))
    peel_res = peeling_heuristics(WalletRequest(address=address))
    transfers = _fetch_subgraph_transfers(address, max_hops=5)

    off_ramps = offramp_res.get("offRamps", [])
    peel_chains = peel_res.get("peel_chains", [])
    velocity_flags = peel_res.get("velocity_flags", [])

    pdf_bytes = _build_pdf(
        address=address,
        case_id=req.case_id,
        officer=req.officer_name,
        notes=req.case_notes,
        off_ramps=off_ramps,
        peel_chains=peel_chains,
        velocity_flags=velocity_flags,
        transactions=transfers,
    )

    filename = f"ChainTrace_Dossier_{req.case_id.replace(' ', '_')}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
