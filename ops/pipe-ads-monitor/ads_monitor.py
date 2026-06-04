#!/usr/bin/env python3
"""
ads_monitor.py — weekly Google Ads performance analysis + safe auto-negatives.

Reads:
  - GOOGLE_ADS_YAML_PATH  path to google-ads.yaml (mounted into container)
  - CUSTOMER_ID           Google Ads customer ID (no dashes)
  - CAMPAIGN_ID           Standard Search campaign ID (for adding negatives)
  - REPO_PATH             local clone of piperehabilitering repo
  - DRY_RUN               if "1", skip mutations and GitHub push (default: "0")

Writes to $REPO_PATH:
  - data/ads-history.json   weekly snapshots array (appended)
  - data/ads-brief.md       LLM-readable weekly digest
"""

import json
import os
import sys
from datetime import date, datetime, timezone
from pathlib import Path

import yaml
from google.ads.googleads.client import GoogleAdsClient
from google.ads.googleads.errors import GoogleAdsException

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

MICROS = 1_000_000

WASTE_PATTERNS = [
    "rørlegger",
    "blikkenslager",
    "snekker",
    "tømrer",
    "murer",
    "ventilasjon",
    "drenering",
    "anleggsgartner",
    "norsk piperehabilitering",
    "varmefag",
    "pipefiks",
    "peis og pipe",
]

# NOK threshold above which a zero-conversion waste-pattern term gets auto-negated
WASTE_COST_THRESHOLD_NOK = 20.0

DAYS = 7


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def required(name: str) -> str:
    val = os.environ.get(name, "").strip()
    if not val:
        raise SystemExit(f"[ads_monitor] Missing required env var: {name}")
    return val


def log(msg: str) -> None:
    ts = datetime.now(timezone.utc).isoformat(timespec="seconds")
    print(f"{ts} {msg}", flush=True)


def micros_to_nok(micros: int) -> float:
    return round(micros / MICROS, 2)


def iso_week() -> str:
    """Return ISO week key like 2026-W23."""
    d = date.today()
    iso = d.isocalendar()
    return f"{iso.year}-W{iso.week:02d}"


def today_iso() -> str:
    return date.today().isoformat()


# ---------------------------------------------------------------------------
# Google Ads queries
# ---------------------------------------------------------------------------

def get_client(yaml_path: str) -> GoogleAdsClient:
    if not Path(yaml_path).exists():
        raise SystemExit(f"[ads_monitor] google-ads.yaml not found at {yaml_path}")
    return GoogleAdsClient.load_from_storage(yaml_path)


def fetch_campaign_stats(client: GoogleAdsClient, customer_id: str, days: int) -> dict:
    """Return aggregate + per-day campaign stats for last N days."""
    service = client.get_service("GoogleAdsService")
    query = f"""
        SELECT
            segments.date,
            campaign.id,
            campaign.name,
            metrics.impressions,
            metrics.clicks,
            metrics.cost_micros,
            metrics.conversions,
            metrics.conversions_value
        FROM campaign
        WHERE segments.date DURING LAST_{days}_DAYS
          AND campaign.status = 'ENABLED'
        ORDER BY segments.date DESC
    """
    response = service.search(customer_id=customer_id, query=query)
    rows = []
    for row in response:
        rows.append({
            "date": row.segments.date,
            "campaign_id": str(row.campaign.id),
            "campaign_name": row.campaign.name,
            "impressions": row.metrics.impressions,
            "clicks": row.metrics.clicks,
            "cost_micros": row.metrics.cost_micros,
            "cost_nok": micros_to_nok(row.metrics.cost_micros),
            "conversions": row.metrics.conversions,
            "conversions_value": row.metrics.conversions_value,
        })

    total_cost = sum(r["cost_micros"] for r in rows)
    total_clicks = sum(r["clicks"] for r in rows)
    total_impressions = sum(r["impressions"] for r in rows)
    total_conversions = sum(r["conversions"] for r in rows)

    return {
        "summary": {
            "impressions": total_impressions,
            "clicks": total_clicks,
            "cost_nok": micros_to_nok(total_cost),
            "ctr_pct": round(total_clicks / total_impressions * 100, 2) if total_impressions else 0.0,
            "conversions": total_conversions,
            "cost_per_conversion": (
                round(micros_to_nok(total_cost) / total_conversions, 2)
                if total_conversions else None
            ),
        },
        "daily": rows,
    }


def fetch_search_terms(client: GoogleAdsClient, customer_id: str, days: int) -> list[dict]:
    """Return search terms with cost, clicks, impressions, conversions."""
    service = client.get_service("GoogleAdsService")
    query = f"""
        SELECT
            search_term_view.search_term,
            search_term_view.status,
            metrics.impressions,
            metrics.clicks,
            metrics.cost_micros,
            metrics.conversions
        FROM search_term_view
        WHERE segments.date DURING LAST_{days}_DAYS
        ORDER BY metrics.cost_micros DESC
    """
    response = service.search(customer_id=customer_id, query=query)
    rows = []
    for row in response:
        cost_nok = micros_to_nok(row.metrics.cost_micros)
        clicks = row.metrics.clicks
        impressions = row.metrics.impressions
        conversions = row.metrics.conversions
        rows.append({
            "term": row.search_term_view.search_term,
            "status": row.search_term_view.status.name,
            "impressions": impressions,
            "clicks": clicks,
            "cost_nok": cost_nok,
            "conversions": conversions,
            "ctr_pct": round(clicks / impressions * 100, 2) if impressions else 0.0,
            "cpc_nok": round(cost_nok / clicks, 2) if clicks else 0.0,
            "conv_rate_pct": round(conversions / clicks * 100, 2) if clicks else 0.0,
        })
    return rows


def fetch_existing_negatives(client: GoogleAdsClient, customer_id: str, campaign_id: str) -> set[str]:
    """Return lowercase set of existing campaign-level negative keyword texts."""
    service = client.get_service("GoogleAdsService")
    query = f"""
        SELECT
            campaign_criterion.keyword.text,
            campaign_criterion.negative
        FROM campaign_criterion
        WHERE campaign_criterion.campaign = 'customers/{customer_id}/campaigns/{campaign_id}'
          AND campaign_criterion.negative = TRUE
          AND campaign_criterion.type = 'KEYWORD'
    """
    try:
        response = service.search(customer_id=customer_id, query=query)
        return {row.campaign_criterion.keyword.text.lower() for row in response}
    except GoogleAdsException:
        # Non-fatal — worst case we try to add a duplicate (API will reject gracefully)
        return set()


def add_negative_keywords(
    client: GoogleAdsClient,
    customer_id: str,
    campaign_id: str,
    terms: list[str],
    dry_run: bool = False,
) -> dict:
    if dry_run:
        return {"dry_run": True, "would_add": terms}
    if not terms:
        return {"added": 0, "terms": []}

    service = client.get_service("CampaignCriterionService")
    campaign_service = client.get_service("CampaignService")
    ops = []
    for term in terms:
        op = client.get_type("CampaignCriterionOperation")
        criterion = op.create
        criterion.campaign = campaign_service.campaign_path(customer_id, campaign_id)
        criterion.negative = True
        criterion.keyword.text = term
        criterion.keyword.match_type = client.enums.KeywordMatchTypeEnum.BROAD
        ops.append(op)

    response = service.mutate_campaign_criteria(customer_id=customer_id, operations=ops)
    return {"added": len(response.results), "terms": terms}


# ---------------------------------------------------------------------------
# Analysis
# ---------------------------------------------------------------------------

def classify_terms(terms: list[dict]) -> dict:
    """Split terms into waste, top_converters, new_negative_candidates, and other."""
    waste = []
    top_converters = []
    candidates = []

    existing_terms_lower = {t["term"].lower() for t in terms}

    for t in terms:
        term_lower = t["term"].lower()
        is_waste_pattern = any(p in term_lower for p in WASTE_PATTERNS)

        if is_waste_pattern and t["cost_nok"] > WASTE_COST_THRESHOLD_NOK and t["conversions"] == 0:
            waste.append(t)
        elif t["conversions"] > 0:
            top_converters.append(t)

        # New negative candidate: waste pattern match, any spend, zero conversions
        if is_waste_pattern and t["conversions"] == 0 and t["cost_nok"] > 0:
            candidates.append(t)

    top_converters.sort(key=lambda x: (-x["conversions"], x["cost_nok"]))
    waste.sort(key=lambda x: -x["cost_nok"])
    candidates.sort(key=lambda x: -x["cost_nok"])

    return {
        "waste": waste,
        "top_converters": top_converters,
        "new_negative_candidates": candidates,
    }


def terms_to_auto_negate(classified: dict, existing_negatives: set[str]) -> list[str]:
    """Return the subset of waste terms not already negated."""
    result = []
    for t in classified["waste"]:
        term = t["term"].strip()
        if term.lower() not in existing_negatives:
            result.append(term)
    return result


# ---------------------------------------------------------------------------
# History JSON
# ---------------------------------------------------------------------------

def load_history(path: Path) -> list:
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return []
    return []


def append_history(path: Path, snapshot: dict) -> list:
    history = load_history(path)
    # Deduplicate by week key — replace if same week already exists
    week_key = snapshot["week"]
    history = [h for h in history if h.get("week") != week_key]
    history.append(snapshot)
    history.sort(key=lambda h: h.get("week", ""))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(history, indent=2, ensure_ascii=False), encoding="utf-8")
    return history


# ---------------------------------------------------------------------------
# Brief generation
# ---------------------------------------------------------------------------

def delta_str(current: float | None, previous: float | None, fmt: str = ".2f") -> str:
    """Format a value with a +/- delta vs previous week."""
    if current is None:
        return "n/a"
    val_str = f"{current:{fmt}}"
    if previous is None:
        return val_str
    diff = current - previous
    sign = "+" if diff >= 0 else ""
    return f"{val_str} ({sign}{diff:{fmt}})"


def generate_brief(
    snapshot: dict,
    prev_snapshot: dict | None,
    auto_negated: list[str],
    classified: dict,
    captured: str,
) -> str:
    s = snapshot["campaign_stats"]["summary"]
    prev_s = prev_snapshot["campaign_stats"]["summary"] if prev_snapshot else None

    lines = [
        "# Pipe Rehab Ads Brief",
        "",
        f"Captured: {captured}",
        f"Period: last {DAYS} days",
        f"Week: {snapshot['week']}",
        "",
        "## Campaign Summary",
        "",
        f"- Spend: NOK {delta_str(s['cost_nok'], prev_s['cost_nok'] if prev_s else None, '.0f')}",
        f"- Clicks: {delta_str(s['clicks'], prev_s['clicks'] if prev_s else None, '.0f')}",
        f"- Impressions: {delta_str(s['impressions'], prev_s['impressions'] if prev_s else None, '.0f')}",
        f"- CTR: {delta_str(s['ctr_pct'], prev_s['ctr_pct'] if prev_s else None)}%",
        f"- Conversions: {delta_str(s['conversions'], prev_s['conversions'] if prev_s else None, '.1f')}",
    ]

    cost_per_conv = s.get("cost_per_conversion")
    prev_cost_per_conv = prev_s.get("cost_per_conversion") if prev_s else None
    if cost_per_conv:
        lines.append(f"- Cost/conversion: NOK {delta_str(cost_per_conv, prev_cost_per_conv, '.0f')}")
    else:
        lines.append("- Cost/conversion: n/a (0 conversions)")

    # Wasted spend
    waste = classified["waste"]
    lines += ["", "## Wasted Spend (waste pattern, 0 conversions, > NOK 20)", ""]
    if waste:
        for t in waste[:10]:
            lines.append(
                f"- \"{t['term']}\"  NOK {t['cost_nok']:.0f}  "
                f"{t['clicks']} clicks  0 conv"
            )
    else:
        lines.append("- None this week.")

    # Top converters
    converters = classified["top_converters"]
    lines += ["", "## Top Converting Terms", ""]
    if converters:
        for t in converters[:10]:
            lines.append(
                f"- \"{t['term']}\"  {t['conversions']:.1f} conv  "
                f"NOK {t['cost_nok']:.0f}  CPC {t['cpc_nok']:.0f}"
            )
    else:
        lines.append("- No converting terms this week.")

    # New negative candidates (not yet above threshold / not yet auto-negated)
    candidates_not_negated = [
        t for t in classified["new_negative_candidates"]
        if t["term"] not in auto_negated
        and t["cost_nok"] <= WASTE_COST_THRESHOLD_NOK
        and t["cost_nok"] > 0
    ]
    lines += ["", "## New Negative Keyword Candidates (manual review)", ""]
    if candidates_not_negated:
        for t in candidates_not_negated[:15]:
            lines.append(
                f"- \"{t['term']}\"  NOK {t['cost_nok']:.2f}  "
                f"{t['clicks']} clicks  0 conv  (below NOK {WASTE_COST_THRESHOLD_NOK} threshold)"
            )
    else:
        lines.append("- None identified.")

    # Auto-applied changes
    lines += ["", "## Auto-Applied Changes This Run", ""]
    if auto_negated:
        lines.append(f"Added {len(auto_negated)} campaign-level negative keyword(s) (BROAD):")
        for term in auto_negated:
            lines.append(f"  - \"{term}\"")
    else:
        lines.append("- No automatic mutations applied.")

    # What changed vs last week
    lines += ["", "## Week-over-Week Changes", ""]
    if prev_snapshot:
        prev_terms = {t["term"]: t for t in prev_snapshot.get("search_terms", [])}
        curr_terms = {t["term"]: t for t in snapshot.get("search_terms", [])}
        new_terms = [t for k, t in curr_terms.items() if k not in prev_terms and t["cost_nok"] > 5]
        dropped_terms = [t for k, t in prev_terms.items() if k not in curr_terms and t["cost_nok"] > 5]
        if new_terms:
            lines.append("New terms (not seen last week, > NOK 5 spend):")
            for t in sorted(new_terms, key=lambda x: -x["cost_nok"])[:8]:
                lines.append(f"  - \"{t['term']}\"  NOK {t['cost_nok']:.0f}")
        if dropped_terms:
            lines.append("Dropped terms (spent last week, absent this week, > NOK 5):")
            for t in sorted(dropped_terms, key=lambda x: -x["cost_nok"])[:8]:
                lines.append(f"  - \"{t['term']}\"  NOK {t['cost_nok']:.0f} last week")
        if not new_terms and not dropped_terms:
            lines.append("- No significant term changes vs last week.")
    else:
        lines.append("- No previous snapshot available for comparison.")

    lines += [""]
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    yaml_path = os.environ.get("GOOGLE_ADS_YAML_PATH", "/home/tim/google-ads/google-ads.yaml")
    customer_id = required("CUSTOMER_ID")
    campaign_id = os.environ.get("CAMPAIGN_ID", "23903483937")
    repo_path = Path(required("REPO_PATH"))
    dry_run = os.environ.get("DRY_RUN", "0") == "1"

    data_dir = repo_path / "data"
    history_path = data_dir / "ads-history.json"
    brief_path = data_dir / "ads-brief.md"

    captured = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    week_key = iso_week()

    log(f"ads_monitor starting  week={week_key}  customer={customer_id}  dry_run={dry_run}")

    # Connect
    client = get_client(yaml_path)
    log("google ads client ready")

    # Fetch data
    log(f"fetching campaign stats (last {DAYS} days)...")
    campaign_stats = fetch_campaign_stats(client, customer_id, DAYS)
    log(f"  summary: NOK {campaign_stats['summary']['cost_nok']:.0f}  "
        f"clicks={campaign_stats['summary']['clicks']}  "
        f"conv={campaign_stats['summary']['conversions']:.1f}")

    log(f"fetching search terms (last {DAYS} days)...")
    search_terms = fetch_search_terms(client, customer_id, DAYS)
    log(f"  {len(search_terms)} terms returned")

    log("fetching existing negatives...")
    existing_negatives = fetch_existing_negatives(client, customer_id, campaign_id)
    log(f"  {len(existing_negatives)} existing negatives")

    # Analyse
    classified = classify_terms(search_terms)
    log(f"  waste terms: {len(classified['waste'])}  "
        f"converters: {len(classified['top_converters'])}  "
        f"candidates: {len(classified['new_negative_candidates'])}")

    # Auto-negate
    to_negate = terms_to_auto_negate(classified, existing_negatives)
    if to_negate:
        log(f"auto-negating {len(to_negate)} term(s): {to_negate}")
        result = add_negative_keywords(client, customer_id, campaign_id, to_negate, dry_run=dry_run)
        log(f"  mutation result: {result}")
    else:
        log("no new terms to auto-negate")

    # Build snapshot
    snapshot = {
        "week": week_key,
        "captured": captured,
        "campaign_stats": campaign_stats,
        "search_terms": search_terms,
        "auto_negated": to_negate,
        "waste_terms": classified["waste"],
        "top_converters": classified["top_converters"],
    }

    # Load history for delta comparison
    history = load_history(history_path)
    prev_snapshot = history[-1] if history else None

    # Append to history
    append_history(history_path, snapshot)
    log(f"wrote {history_path}")

    # Generate brief
    brief = generate_brief(snapshot, prev_snapshot, to_negate, classified, captured)
    data_dir.mkdir(parents=True, exist_ok=True)
    brief_path.write_text(brief, encoding="utf-8")
    log(f"wrote {brief_path}")

    log("done")


if __name__ == "__main__":
    main()
