# Google Ads Iterative Optimisation Plan — Piperehabilitering AS

**Account:** f4investas@gmail.com (762-918-8870)  
**MCC:** tim@hyperspeed.studio (719-898-3872)  
**Blocker:** MCC link pending (see #3 — 2FA on f4investas)  
**Current spend:** ~1,606 kr / 26 days · 87 clicks · 3 calls · no conversion tracking

---

## How this plan works

Each phase unlocks the next. An agent runs the API queries, reasons through what to do, applies changes autonomously where confidence is high, and escalates only when blast radius is too large or brand decisions are involved. Nothing in phase 2 is worth doing until phase 1 is complete.

---

## Autonomous decision framework

The agent doesn't ask for permission — it acts, logs, and gives a rollback window. Escalation is the exception, not the default.

### Confidence tiers

```python
def decide(action, context):
    """
    Returns: "auto_apply" | "auto_apply_with_rollback" | "escalate"
    """

    # TIER 1 — auto apply, no rollback needed
    # Clear signal, fully reversible, low blast radius
    if action["type"] == "keyword_paused":
        if context["clicks"] > 20 and context["conversions"] == 0:
            return "auto_apply"

    if action["type"] == "negative_added":
        if context["intent"] in ["non_commercial", "diy", "out_of_area"]:
            return "auto_apply"

    if action["type"] == "budget_alert":
        return "auto_apply"  # just a notification, no spend change

    # TIER 2 — auto apply with 24h rollback window
    # Meaningful change but small enough to recover from
    if action["type"] == "bid_adjusted":
        if abs(context["change_pct"]) <= 20:
            return "auto_apply_with_rollback"

    if action["type"] == "keyword_paused":
        if context["clicks"] <= 20:
            return "auto_apply_with_rollback"

    # TIER 3 — escalate (daily digest, human decides)
    # High blast radius or brand/copy implications
    if action["type"] in [
        "headline_replaced",       # copy has brand implications
        "campaign_restructured",   # structural, hard to unwind
        "budget_changed",          # spend implications >20%
        "ad_group_paused",         # broad impact
    ]:
        return "escalate"

    return "auto_apply_with_rollback"  # default: act with rollback
```

### Rollback window

Every auto-applied action gets a 24-hour rollback deadline:

```json
{
  "action": "keyword_paused",
  "keyword": "piperehabilitering diy",
  "applied_at": "2026-06-01T08:00:00Z",
  "rollback_deadline": "2026-06-02T08:00:00Z",
  "rollback_cmd": "enable_keyword(customer_id, criterion_id=12345)",
  "reason": "23 clicks, 0 conversions over 14 days",
  "status": "applied_pending_rollback_window"
}
```

After the deadline passes with no rollback → status becomes `confirmed`.

### Daily digest (replaces approval queue)

Instead of a queue waiting on you, the agent sends a daily summary of what it did:

```
📊 Piperehabilitering Ads — Daily digest 2026-06-01

APPLIED (rollback open until tomorrow):
  ✓ Paused keyword "piperehabilitering diy" — 23 clicks, 0 conversions
  ✓ Added negative "kurs" — non-commercial intent
  ✓ Raised bid on "piperehabilitering skien" +15% — QS=8, CPA below target

ESCALATED (needs your call):
  ⚠ Replace headline "Trygg pipe, trygt hjem" (LOW x2 weeks)
    → Proposed: "Sprekk i pipa? Vi fikser det"
    → Approve: reply Y / Reject: reply N

ALERTS:
  🔴 CPA up 40% vs 4-week avg — investigate search terms report
```

Digest delivered via Slack/Telegram (same channel as SERP alerts). Escalations are yes/no replies — no dashboard needed.

### Escalation only for:
1. **High blast radius** — pausing ad groups, restructuring campaigns, budget changes >20%
2. **Brand/copy** — anything that changes what words appear in the ad
3. **Genuine uncertainty** — conflicting signals where the agent can't determine the right call

Everything else: act first, log it, rollback window open.

---

## Phase 1 — Foundation (do once, blocks everything else)

### 1.1 Link MCC + get API access
- Resolve #3 (2FA on f4investas)
- From MCC: Accounts → + → Link existing → `762-918-8870`
- Go to Tools → API Center on MCC → apply for developer token
- Set up OAuth credentials in Google Cloud Console
- Generate refresh token for f4investas account
- Write `google-ads.yaml`

### 1.2 Set up conversion tracking

No CRM, no call recording — three lightweight signals from the Google tag only.

**Conversion model:**

| Signal | Value | Rationale |
|---|---|---|
| Click-to-call (`tel:` link) | 200 kr | Highest intent — they picked up the phone |
| Befaring button click (`#bestill`) | 100 kr | Strong intent — ready to book |
| Time on page >60 seconds | 50 kr | Warm lead — engaged enough to read |

Agent optimises toward weighted value across all three signals combined.

**Add Google tag to all HTML pages:**

```html
<!-- In <head> of index.html and all city pages -->
<script async src="https://www.googletagmanager.com/gtag/js?id=AW-XXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'AW-XXXXXXXXX');

  // Signal 1: click-to-call
  document.querySelectorAll('a[href^="tel:"]').forEach(el => {
    el.addEventListener('click', () => {
      gtag('event', 'conversion', {
        send_to: 'AW-XXXXXXXXX/CALL',
        value: 200,
        currency: 'NOK'
      });
    });
  });

  // Signal 2: befaring button click
  document.querySelectorAll('a[href="#bestill"]').forEach(el => {
    el.addEventListener('click', () => {
      gtag('event', 'conversion', {
        send_to: 'AW-XXXXXXXXX/BEFARING',
        value: 100,
        currency: 'NOK'
      });
    });
  });

  // Signal 3: time on page >60 seconds
  setTimeout(() => {
    gtag('event', 'conversion', {
      send_to: 'AW-XXXXXXXXX/ENGAGED',
      value: 50,
      currency: 'NOK'
    });
  }, 60000);
</script>
```

**Create conversion actions via API** (see #4 artifact for full API setup):

```python
CONVERSION_ACTIONS = [
    {"name": "Klikk på telefon",     "value": 200, "type": "WEBPAGE"},
    {"name": "Klikk på befaring",    "value": 100, "type": "WEBPAGE"},
    {"name": "60s på siden",         "value": 50,  "type": "WEBPAGE"},
]
```

**Gate:** Do not proceed to Phase 2 until conversion data is flowing for at least 2 weeks.

---

## Phase 2 — Audit & Clean (week 2–3)

### 2.1 Pull search terms report (run weekly)

```python
query = """
    SELECT
        search_term_view.search_term,
        search_term_view.status,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.ctr
    FROM search_term_view
    WHERE segments.date DURING LAST_30_DAYS
    ORDER BY metrics.cost_micros DESC
"""
```

**Agent logic:**
- Flag any term with >2 clicks and 0 conversions → candidate negative keyword
- Flag any term with >0 conversions → promote to exact match keyword
- Flag any term outside service area → add as negative

### 2.2 Build negative keyword list

Seeds to add immediately (before data):
```
diy, selv, youtube, kurs, utdanning, jobb, stilling, lærling,
oslo, bergen, trondheim, stavanger, kristiansand,
produkter, kjøp, nettbutikk, pris stål, rør pris
```

```python
# Add negative keywords via API
shared_set_service = client.get_service("SharedSetService")
# ... create shared negative keyword list and apply to all campaigns
```

### 2.3 Keyword audit

Pull all active keywords + quality scores:
```python
query = """
    SELECT
        ad_group_criterion.keyword.text,
        ad_group_criterion.keyword.match_type,
        ad_group_criterion.quality_info.quality_score,
        ad_group_criterion.quality_info.creative_quality_score,
        ad_group_criterion.quality_info.post_click_quality_score,
        metrics.average_cpc,
        metrics.impressions,
        metrics.clicks,
        metrics.conversions
    FROM keyword_view
    WHERE segments.date DURING LAST_30_DAYS
"""
```

**Agent logic:**
- QS < 5 → flag for ad copy / landing page fix
- QS >= 7 + conversions > 0 → increase bid
- 0 impressions after 14 days → pause keyword
- Broad match keywords with spend → convert to phrase or exact

**Gate:** Do not proceed to Phase 3 until negatives are in and search terms reviewed.

---

## Phase 3 — Structure (week 3–4)

### 3.1 Campaign structure (SKAG-lite)

Current problem: likely one ad group with all keywords. Better structure:

```
Campaign: Piperehabilitering — Telemark
  Ad group: Skien
    Keywords: [piperehabilitering skien], "piperehabilitering skien"
    Landing page: /piperehabilitering-skien
  Ad group: Porsgrunn  
    Keywords: [piperehabilitering porsgrunn], "piperehabilitering porsgrunn"
    Landing page: /piperehabilitering-porsgrunn
  Ad group: Telemark (regional)
    Keywords: [piperehabilitering telemark], "rehabilitering av pipe telemark"
    Landing page: index.html

Campaign: Piperehabilitering — Vestfold
  Ad group: Larvik
  Ad group: Tønsberg
  Ad group: Sandefjord
  Ad group: Vestfold (regional)

Campaign: Pricing intent
  Ad group: Pris
    Keywords: [piperehabilitering pris], "hva koster piperehabilitering"
    Landing page: /piperehabilitering-pris (build this — #1 in tracker)
```

### 3.2 Ad copy per ad group

Each ad group needs 3 responsive search ad headlines. Formula:
- Headline 1: service + city (`Piperehabilitering Skien`)
- Headline 2: USP (`Gratis befaring · Fast pris`)
- Headline 3: trust (`15+ år erfaring · Ring i dag`)

### 3.3 Ad extensions
- **Call extension:** +47 452 02 013 (schedule: Mon–Fri 08–17)
- **Location extension:** link Google Business Profile
- **Sitelink extensions:** Gratis befaring, Om oss, Priser, Kontakt
- **Callout extensions:** Gratis befaring, Fast pris, 15 års garanti, Hele Telemark

---

## Phase 4 — Bidding (week 4–6, needs 30+ conversions)

### 4.1 Bid strategy progression

```
Manual CPC (now)
  → Enhanced CPC (when conversion tracking live)
    → Maximize Conversions (when 15+ conversions/month)
      → Target CPA (when stable volume, set CPA = ~400 kr/lead)
```

### 4.2 Dayparting

Pull hourly performance once 4 weeks of data exists:
```python
query = """
    SELECT
        segments.hour,
        segments.day_of_week,
        metrics.clicks,
        metrics.conversions,
        metrics.cost_micros
    FROM campaign
    WHERE segments.date DURING LAST_30_DAYS
"""
```

**Agent logic:** reduce bids -30% on hours with 0 conversions and >5 clicks.

### 4.3 Device bid adjustments

```python
query = """
    SELECT
        segments.device,
        metrics.clicks,
        metrics.conversions,
        metrics.cost_micros
    FROM campaign
    WHERE segments.date DURING LAST_30_DAYS
"""
```

Mobile likely converts better for phone calls → increase mobile bid +20% if data confirms.

---

## Phase 5 — Ongoing weekly agent loop

Once structure is set, run this weekly:

```python
def weekly_audit(customer_id):
    # 1. Pull last 7 days search terms → flag new negatives
    new_negatives = get_search_terms_to_negate(customer_id)

    # 2. Pull keyword performance → pause underperformers
    pause_keywords_below_threshold(customer_id, min_ctr=0.02, min_qs=5)

    # 3. Pull campaign costs → alert if daily spend >500 kr
    check_budget_pacing(customer_id, daily_budget_kr=200)

    # 4. Pull conversion data → report CPA by campaign
    report = build_weekly_report(customer_id)

    # 5. Auction insights — respond to competitor movements
    check_auction_insights(customer_id)

    # 6. GSC overlap — pause paid keywords ranking organically top 3
    check_gsc_overlap(customer_id)

    # 7. Keyword discovery — propose new keywords from Planner
    discover_new_keywords(customer_id)

    # 8. Landing page health — verify all destination URLs return 200
    check_landing_pages(customer_id)

    # 9. RSA rotation — replace POOR headlines
    weekly_rsa_audit(customer_id)

    # 10. Remarketing — build audiences, enable similar when ready
    manage_remarketing(customer_id)

    # 11. Cross-campaign budget reallocation
    reallocate_budgets(customer_id)

    # 12. Monthly pacing — trim or raise bids based on spend rate
    check_monthly_pacing(customer_id)

    # 13. QS degradation response
    check_qs_degradation(customer_id)

    # 14. Write report to data/ads-weekly.json
    save_report(report)

# Daily (lighter loop — runs every morning)
def daily_audit(customer_id):
    check_budget_pacing(customer_id)       # budget burning too fast?
    check_landing_pages(customer_id)       # anything broken overnight?
    apply_weather_bid_adjustments()        # yr.no forecast → bid modifiers
    check_monthly_pacing(customer_id)      # on track for month?
```

Schedule both on arrakis:
- Weekly audit: `0 8 * * 1` (Monday 08:00)
- Daily audit: `0 7 * * *` (Every day 07:00 — before business hours)

---

## Auction insights — competitor response

Detects when a competitor starts outbidding on specific keywords and raises bids defensively.

```python
query = """
    SELECT
        auction_insight_domain,
        metrics.auction_insight_search_overlap_rate,
        metrics.auction_insight_search_outranking_share,
        metrics.auction_insight_search_top_impression_percentage,
        campaign.name
    FROM campaign
    WHERE segments.date DURING LAST_7_DAYS
"""

TRACKED_COMPETITORS = [
    "norskpiperehabilitering.no",
    "pipefiks.no",
    "vtpipe.no",
    "alfavarme.no",
]

def check_auction_insights(customer_id):
    results = pull_auction_insights(customer_id)
    actions = []

    for row in results:
        domain = row["auction_insight_domain"]
        if domain not in TRACKED_COMPETITORS:
            continue

        overlap = row["metrics"]["auction_insight_search_overlap_rate"]
        outranking = row["metrics"]["auction_insight_search_outranking_share"]

        # Competitor outranking us on >60% of auctions → raise bid defensively
        if outranking > 0.6:
            actions.append({
                "type": "bid_adjusted",
                "reason": f"{domain} outranking us {outranking:.0%} of auctions",
                "change_pct": 15,
                "tier": decide("bid_adjusted", {"change_pct": 15})
            })

        # New competitor appearing (overlap >30% when last week was <10%) → alert
        if overlap > 0.3 and row.get("prev_overlap", 0) < 0.1:
            actions.append({
                "type": "anomaly_detected",
                "reason": f"New competitor {domain} entering our auctions",
                "tier": "escalate"
            })

    log_action("auction_insights", actions, {})
```

---

## GSC ↔ Ads overlap

You already pull `data/gsc-history.json`. Agent joins GSC organic rankings with paid keywords — if you're ranking top 3 organically, pause or drastically reduce the paid bid.

```python
import json, pathlib

def check_gsc_overlap(customer_id):
    # Load latest GSC snapshot
    gsc = json.loads(pathlib.Path("data/gsc-history.json").read_text())
    latest = gsc[-1]["queries"]  # most recent snapshot

    # Build map of query → organic position
    organic_positions = {
        row["query"]: row["position"]
        for row in latest
    }

    # Pull active paid keywords
    paid_keywords = pull_active_keywords(customer_id)

    actions = []
    for kw in paid_keywords:
        term = kw["text"].lower()
        organic_pos = organic_positions.get(term)

        if organic_pos and organic_pos <= 3:
            # Ranking top 3 organically — pause paid or cut bid 80%
            actions.append({
                "type": "bid_adjusted",
                "keyword": term,
                "change_pct": -80,
                "reason": f"Organic position {organic_pos:.1f} — paying for free clicks",
                "tier": decide("bid_adjusted", {"change_pct": -80})
            })

        elif organic_pos and organic_pos <= 6:
            # Ranking 4–6 — reduce bid moderately, let organic do work
            actions.append({
                "type": "bid_adjusted",
                "keyword": term,
                "change_pct": -30,
                "reason": f"Organic position {organic_pos:.1f} — reduce paid overlap",
                "tier": "auto_apply_with_rollback"
            })

    log_action("gsc_overlap", actions, {})
```

---

## Keyword discovery

Agent proactively queries Google Keyword Planner weekly for new city/service terms. Proposes additions — never adds without escalation since adding keywords affects spend.

```python
from google.ads.googleads.client import GoogleAdsClient

def discover_new_keywords(customer_id):
    keyword_plan_idea_service = client.get_service("KeywordPlanIdeaService")

    # Seed keywords — what we already know works
    seed_keywords = [
        "piperehabilitering",
        "rehabilitering av pipe",
        "foring av pipe",
        "skorsteinsrehabilitering",
    ]

    # Geo targets — Norway municipalities we serve
    geo_targets = ["1010921", "1010922", "1010923"]  # Skien, Porsgrunn, Telemark

    request = client.get_type("GenerateKeywordIdeasRequest")
    request.customer_id = customer_id
    request.language = "1009"  # Norwegian
    request.geo_target_constants = [
        f"geoTargetConstants/{g}" for g in geo_targets
    ]
    request.keyword_seed.keywords.extend(seed_keywords)

    ideas = keyword_plan_idea_service.generate_keyword_ideas(request=request)

    candidates = []
    for idea in ideas:
        metrics = idea.keyword_idea_metrics
        # Only surface keywords with meaningful volume and low competition
        if metrics.avg_monthly_searches >= 50 and metrics.competition_index <= 60:
            candidates.append({
                "keyword": idea.text,
                "monthly_searches": metrics.avg_monthly_searches,
                "competition": metrics.competition_index,
                "suggested_bid_kr": metrics.average_cpc_micros / 1_000_000,
            })

    # Always escalate — adding keywords changes spend
    if candidates:
        log_action("keyword_discovery", [{
            "type": "keywords_proposed",
            "candidates": candidates[:10],  # top 10 by volume
            "tier": "escalate",
            "reason": "New keyword opportunities found"
        }], {})
```

---

## Landing page health check

Before the weekly bid adjustments run, verify every destination URL is alive and fast. Pointless to raise bids on a broken or slow page.

```python
import httpx, time

def check_landing_pages(customer_id):
    query = """
        SELECT
            ad_group_ad.ad.final_urls,
            ad_group_ad.ad.id,
            campaign.name,
            metrics.clicks
        FROM ad_group_ad
        WHERE ad_group_ad.status = 'ENABLED'
    """

    ads = pull_ads(customer_id, query)
    actions = []

    for ad in ads:
        for url in ad["final_urls"]:
            start = time.time()
            try:
                r = httpx.get(url, timeout=10, follow_redirects=True)
                load_time = time.time() - start

                if r.status_code != 200:
                    actions.append({
                        "type": "anomaly_detected",
                        "reason": f"Landing page {url} returned {r.status_code}",
                        "ad_id": ad["id"],
                        "tier": "escalate"  # broken page → pause ad immediately
                    })

                elif load_time > 3.0:
                    actions.append({
                        "type": "anomaly_detected",
                        "reason": f"Landing page {url} slow ({load_time:.1f}s) — QS risk",
                        "ad_id": ad["id"],
                        "tier": "escalate"
                    })

            except httpx.TimeoutException:
                actions.append({
                    "type": "anomaly_detected",
                    "reason": f"Landing page {url} timed out",
                    "ad_id": ad["id"],
                    "tier": "escalate"
                })

    log_action("landing_page_health", actions, {})

---

## Remarketing + similar audiences

Build a remarketing list from site visitors, bid higher when they search again, and enable Similar Audiences automatically when list hits 1000 users.

```python
def manage_remarketing(customer_id):
    # Step 1: create user list (run once)
    # Requires Google tag on site (already needed for conversion tracking)
    user_list_service = client.get_service("UserListService")
    
    # Check existing list size
    query = """
        SELECT user_list.name, user_list.size_for_search
        FROM user_list
        WHERE user_list.name = 'Pipe Rehab — Site Visitors'
    """
    lists = pull_user_lists(customer_id, query)
    
    for ul in lists:
        size = ul["user_list"]["size_for_search"]
        
        # Under 100 users — not usable yet, just log
        if size < 100:
            log_action("remarketing", [{
                "type": "anomaly_detected",
                "reason": f"Remarketing list has {size} users — need 100+ to activate",
                "tier": "none"
            }], {})
            return

        # 100–999 users — activate RLSA bid boost
        if 100 <= size < 1000:
            # Apply +40% bid modifier for remarketing list
            apply_rlsa_bid_modifier(customer_id, modifier=1.4)
            log_action("remarketing", [{
                "type": "bid_adjusted",
                "reason": f"RLSA active — {size} site visitors, +40% bid modifier",
                "tier": "auto_apply"
            }], {})

        # 1000+ users — enable Similar Audiences
        if size >= 1000:
            enable_similar_audiences(customer_id)
            log_action("remarketing", [{
                "type": "audience_enabled",
                "reason": f"Similar Audiences enabled — list hit {size} users",
                "tier": "auto_apply"
            }], {})
```

**What this does:**
- Someone visits pipe-rehab.no but doesn't call
- They later search "piperehabilitering skien" again
- Your ad bids 40% higher for them — they're already warm
- Once 1000 visitors accumulated, Google finds similar profiles automatically

---

## Cross-campaign budget reallocation

If one campaign hits its daily budget early but another has budget left with no conversions, shift money toward what's working.

```python
TOTAL_DAILY_BUDGET_KR = 300  # adjust to actual

def reallocate_budgets(customer_id):
    query = """
        SELECT
            campaign.id,
            campaign.name,
            campaign.campaign_budget,
            metrics.cost_micros,
            metrics.conversions,
            metrics.clicks
        FROM campaign
        WHERE segments.date = TODAY
    """
    campaigns = pull_campaigns(customer_id, query)
    actions = []

    total_spend = sum(c["metrics"]["cost_micros"] for c in campaigns) / 1_000_000
    remaining_budget = TOTAL_DAILY_BUDGET_KR - total_spend

    for c in campaigns:
        spend_kr = c["metrics"]["cost_micros"] / 1_000_000
        budget_kr = c["campaign_budget"] / 1_000_000
        utilisation = spend_kr / budget_kr if budget_kr > 0 else 0
        cpa = spend_kr / c["metrics"]["conversions"] if c["metrics"]["conversions"] > 0 else None

        # Campaign hitting budget cap before end of day → strong performer
        if utilisation >= 0.9 and cpa and cpa < 400:
            new_budget = budget_kr * 1.2
            actions.append({
                "type": "budget_changed",
                "campaign": c["campaign"]["name"],
                "old_budget_kr": budget_kr,
                "new_budget_kr": new_budget,
                "reason": f"90%+ utilisation, CPA {cpa:.0f} kr — increase budget",
                "tier": decide("budget_changed", {"change_pct": 20})
            })

        # Campaign with budget left but zero conversions and low CTR → reduce
        if utilisation < 0.3 and c["metrics"]["clicks"] > 10 and c["metrics"]["conversions"] == 0:
            new_budget = budget_kr * 0.8
            actions.append({
                "type": "budget_changed",
                "campaign": c["campaign"]["name"],
                "old_budget_kr": budget_kr,
                "new_budget_kr": new_budget,
                "reason": "Low utilisation + zero conversions — reduce budget",
                "tier": "auto_apply_with_rollback"
            })

    log_action("budget_reallocation", actions, {"total_spend_kr": total_spend})
```

---

## Monthly pacing

Runs daily. Keeps spend on track for the month — trims bids if burning fast, raises if underutilising.

```python
import datetime

def check_monthly_pacing(customer_id, monthly_budget_kr=6000):
    today = datetime.date.today()
    days_in_month = (today.replace(month=today.month % 12 + 1, day=1) - datetime.timedelta(days=1)).day
    days_elapsed = today.day
    days_remaining = days_in_month - days_elapsed

    expected_spend = monthly_budget_kr * (days_elapsed / days_in_month)
    actual_spend = pull_month_to_date_spend(customer_id)

    pacing_ratio = actual_spend / expected_spend if expected_spend > 0 else 1
    projected_spend = (actual_spend / days_elapsed) * days_in_month

    actions = []

    # Burning too fast — on track to overspend >15%
    if projected_spend > monthly_budget_kr * 1.15:
        actions.append({
            "type": "bid_adjusted",
            "change_pct": -15,
            "reason": f"Projected monthly spend {projected_spend:.0f} kr vs budget {monthly_budget_kr} kr — trim bids",
            "tier": "auto_apply_with_rollback"
        })

    # Underspending — on track to use <70% of budget
    elif projected_spend < monthly_budget_kr * 0.7:
        actions.append({
            "type": "bid_adjusted",
            "change_pct": +15,
            "reason": f"Projected monthly spend {projected_spend:.0f} kr — underutilising budget, raise bids",
            "tier": "auto_apply_with_rollback"
        })

    log_action("monthly_pacing", actions, {
        "actual_spend_kr": actual_spend,
        "projected_spend_kr": projected_spend,
        "monthly_budget_kr": monthly_budget_kr,
        "pacing_ratio": pacing_ratio
    })
```

---

## Quality Score degradation response

QS can drop silently. Agent detects week-over-week drops, diagnoses the cause, and fixes what it can automatically.

```python
def check_qs_degradation(customer_id):
    current = pull_keyword_qs(customer_id, "LAST_7_DAYS")
    previous = pull_keyword_qs(customer_id, "LAST_14_DAYS")  # prior week

    actions = []

    for kw in current:
        prev = next((p for p in previous if p["keyword"] == kw["keyword"]), None)
        if not prev:
            continue

        qs_drop = prev["qs"] - kw["qs"]

        if qs_drop >= 2:
            # Diagnose which component dropped
            if kw["expected_ctr"] == "BELOW_AVERAGE":
                # Ad copy doesn't contain keyword → fix headline
                actions.append({
                    "type": "anomaly_detected",
                    "keyword": kw["keyword"],
                    "reason": f"QS dropped {qs_drop} pts — Expected CTR below avg, keyword missing from headlines",
                    "fix": "Ensure keyword appears in headline 1 of RSA",
                    "tier": "escalate"
                })

            if kw["landing_page_experience"] == "BELOW_AVERAGE":
                # Landing page relevance dropped
                actions.append({
                    "type": "anomaly_detected",
                    "keyword": kw["keyword"],
                    "reason": f"QS dropped {qs_drop} pts — Landing page experience below avg",
                    "fix": f"Check {kw['final_url']} contains keyword in H1 and body",
                    "tier": "escalate"
                })

            if kw["ad_relevance"] == "BELOW_AVERAGE":
                # Ad group too broad — keyword doesn't match ads
                actions.append({
                    "type": "anomaly_detected",
                    "keyword": kw["keyword"],
                    "reason": f"QS dropped {qs_drop} pts — Ad relevance below avg, consider moving to own ad group",
                    "tier": "escalate"
                })

    log_action("qs_degradation", actions, {})
```

---

## Weather-based bidding

yr.no (Norwegian Meteorological Institute) has a free, no-key API. Cold forecasts and storms correlate with pipe rehab demand — people worry about heating. Agent checks the forecast every morning and adjusts bid modifiers for the day.

```python
import httpx

# Service area coordinates
LOCATIONS = {
    "skien":     {"lat": 59.2076, "lon": 9.5957},
    "porsgrunn": {"lat": 59.1405, "lon": 9.6562},
    "larvik":    {"lat": 59.0558, "lon": 10.0284},
    "tonsberg":  {"lat": 59.2671, "lon": 10.4076},
}

def get_forecast(lat, lon):
    url = f"https://api.met.no/weatherapi/locationforecast/2.0/compact?lat={lat}&lon={lon}"
    r = httpx.get(url, headers={"User-Agent": "pipe-rehab-ads-agent/1.0 post@pipe-rehab.no"})
    data = r.json()
    # Next 24h average temperature
    periods = data["properties"]["timeseries"][:8]  # 3h intervals = 24h
    temps = [p["data"]["instant"]["details"]["air_temperature"] for p in periods]
    rain = sum(
        p["data"].get("next_6_hours", {}).get("details", {}).get("precipitation_amount", 0)
        for p in periods
    )
    return {"avg_temp": sum(temps) / len(temps), "rain_mm": rain}

def apply_weather_bid_adjustments():
    actions = []

    for city, coords in LOCATIONS.items():
        forecast = get_forecast(coords["lat"], coords["lon"])
        temp = forecast["avg_temp"]
        rain = forecast["rain_mm"]

        # Cold snap (<5°C) → people firing up heating → +25% bids
        if temp < 5:
            modifier = 1.25
            reason = f"{city}: {temp:.0f}°C forecast — heating season demand"

        # Storm / heavy rain (>10mm) → roof/pipe anxiety → +15% bids
        elif rain > 10:
            modifier = 1.15
            reason = f"{city}: {rain:.0f}mm rain forecast — pipe concern spike"

        # Warm summer day (>18°C) → low demand → -20% bids
        elif temp > 18:
            modifier = 0.80
            reason = f"{city}: {temp:.0f}°C forecast — low heating season demand"

        # Normal — no adjustment
        else:
            continue

        actions.append({
            "type": "bid_adjusted",
            "campaign": f"Piperehabilitering — {city.title()}",
            "modifier": modifier,
            "reason": reason,
            "tier": "auto_apply"  # daily, small, fully reversible next morning
        })

    log_action("weather_bidding", actions, {})
```

**Why this works:**
- yr.no is the official Norwegian meteorological API — accurate, free, no rate limits for reasonable use
- Bid modifiers reset daily so there's no compounding risk
- Nobody else in this market is doing it — pure competitive edge

---

## KPIs to track

| Metric | Now | Target |
|---|---|---|
| Cost per click | ~18 kr | <15 kr |
| CTR | ~3.1% | >5% |
| Call rate | 3.4% | >6% |
| Cost per call | ~535 kr | <300 kr |
| Quality Score avg | unknown | >6 |

---

## Ad copy optimisation loop (RSA rotation)

Google's Responsive Search Ads (RSAs) accept up to 15 headlines and 4 descriptions per ad. Google's ML tests all combinations automatically — 15 headlines = up to 43,000 combinations rotating in real time. The agent's job is to read performance labels weekly and replace POOR headlines with new angles.

### Headline bank (15 per ad group — localise city name)

Cover these angles, one headline per angle:

| Angle | Example headline |
|---|---|
| Service + city | `Piperehabilitering Skien` |
| Free inspection | `Gratis befaring i Skien` |
| Fixed price | `Fast pris – ingen overraskelser` |
| Price anchor | `Fra 18 000 kr inkl. mva` |
| Speed | `Ferdig på én dag` |
| Guarantee | `15 års garanti på rehabilitering` |
| Safety | `Trygg pipe, trygt hjem` |
| Certified | `Godkjent og sertifisert montør` |
| Local | `Lokalt firma i Telemark` |
| Experience | `10+ års erfaring med piper` |
| No obligation | `Uforpliktende befaring og tilbud` |
| Problem-aware | `Sprekk i pipa? Vi fikser det` |
| Problem-aware 2 | `Dårlig trekk? Ring oss i dag` |
| Social proof | `Over 50 rehabiliterte piper i Telemark` |
| Urgency | `Book befaring – ledig denne uken` |

### Description bank (4 descriptions)

```
Vi rehabiliterer piper i Skien, Porsgrunn og hele Telemark. 
Gratis befaring, fast pris, rask utførelse. Ring oss i dag.

Sprekker, fukt og slitasje gjør pipen din til en risiko. 
Vi gir deg en trygg pipe med 15 års garanti. Gratis befaring.

Godkjent og sertifisert montør. Vi ordner søknad til kommunen, 
selve jobben og opprydding. Fast pris etter befaring.

Lokal bedrift i Telemark med 10+ års erfaring. 
Over 50 fornøyde kunder. Bestill gratis befaring på nett.
```

### Weekly RSA audit (agent logic)

```python
query = """
    SELECT
        asset.text_asset.text,
        ad_group_ad_asset_view.field_type,
        ad_group_ad_asset_view.performance_label,
        ad_group_ad_asset_view.pinned_field,
        metrics.impressions,
        metrics.clicks,
        metrics.conversions
    FROM ad_group_ad_asset_view
    WHERE ad_group_ad.ad.type = 'RESPONSIVE_SEARCH_AD'
    AND segments.date DURING LAST_30_DAYS
"""

# Performance labels: BEST, GOOD, LOW, LEARNING, UNRATED
# Agent rules:
# BEST  → never touch, protect from replacement
# GOOD  → keep
# LOW   → flag for replacement after 2 consecutive LOW weeks
# LEARNING → leave alone, needs more data
# UNRATED → leave alone, needs more data
```

### Replacement logic

```python
def get_replacement_headline(poor_headline, existing_headlines, headline_bank):
    # Pick an angle not already in the ad
    used_angles = detect_angles(existing_headlines)
    candidates = [h for h in headline_bank if h["angle"] not in used_angles]
    return candidates[0] if candidates else None

def weekly_rsa_audit(customer_id):
    assets = pull_asset_performance(customer_id)
    replacements = []

    for asset in assets:
        if asset["performance_label"] == "LOW":
            asset["consecutive_low"] = asset.get("consecutive_low", 0) + 1
            if asset["consecutive_low"] >= 2:
                replacement = get_replacement_headline(
                    asset["text"],
                    get_current_headlines(asset["ad_group"]),
                    HEADLINE_BANK
                )
                if replacement:
                    replacements.append({
                        "type": "headline_replaced",
                        "old": asset["text"],
                        "new": replacement["text"],
                        "reason": "LOW performance for 2 consecutive weeks",
                        "auto": False,  # flag for review, don't auto-apply
                        "status": "pending_review"
                    })

    log_action("rsa_audit", replacements, {})
```

Replacements go to the review queue — you approve, agent applies. BEST headlines are never touched regardless of what the bank contains.

### What not to do
- Don't run 20 separate ads — traffic dilution means no variant reaches statistical significance
- Don't pin headlines to positions unless testing a specific hypothesis (pinning removes Google's ability to optimise)
- Don't replace LEARNING or UNRATED assets — they need at least 4 weeks of impressions

---

## Changelog

Every action the agent takes (or recommends) is appended to `data/ads-changelog.json`. Append-only — never overwritten.

### Schema

```json
{
  "entries": [
    {
      "ts": "2026-05-27T10:00:00Z",
      "run_type": "weekly_audit",
      "actions": [
        {
          "type": "keyword_paused",
          "keyword": "piperehabilitering diy",
          "ad_group": "Skien",
          "reason": "QS=3, 12 clicks, 0 conversions",
          "auto": true
        },
        {
          "type": "negative_flagged",
          "keyword": "piperehabilitering kurs",
          "reason": "non-commercial intent",
          "auto": false,
          "status": "pending_review"
        },
        {
          "type": "bid_adjusted",
          "keyword": "piperehabilitering skien",
          "old_bid_kr": 15,
          "new_bid_kr": 18,
          "reason": "QS=8, CPA below target",
          "auto": true
        }
      ],
      "summary": {
        "spend_kr": 312.50,
        "clicks": 18,
        "conversions": 2,
        "cpa_kr": 156.25,
        "flags_pending_review": 1
      }
    }
  ]
}
```

### Action types

| type | auto | description |
|---|---|---|
| `keyword_paused` | yes | keyword paused due to QS or zero conversions |
| `keyword_enabled` | yes | previously paused keyword re-enabled |
| `negative_flagged` | no | search term flagged, awaiting human approval |
| `negative_added` | yes (after approval) | negative keyword added to campaign |
| `bid_adjusted` | yes | CPC bid changed |
| `budget_alert` | no | daily spend exceeds threshold |
| `anomaly_detected` | no | metric deviates >30% from 4-week average |
| `keyword_promoted` | no | search term flagged for promotion to exact match |
| `ad_disapproved` | no | Google disapproved an ad — needs attention |

### Review workflow

```
agent flags → status: "pending_review"
  → you review in admin dashboard
    → approve → agent applies → status: "applied"
    → reject → status: "rejected", never flagged again
```

Pending reviews surface as a badge in the admin dashboard header.

### Python append function

```python
import json, datetime, pathlib

CHANGELOG = pathlib.Path("data/ads-changelog.json")

def log_action(run_type, actions, summary):
    if CHANGELOG.exists():
        data = json.loads(CHANGELOG.read_text())
    else:
        data = {"entries": []}

    data["entries"].append({
        "ts": datetime.datetime.utcnow().isoformat() + "Z",
        "run_type": run_type,
        "actions": actions,
        "summary": summary
    })

    CHANGELOG.write_text(json.dumps(data, indent=2, ensure_ascii=False))
```

---

## Files to create

- `ops/google-ads-monitor/` — weekly audit script (mirrors SERP monitor pattern)
- `data/ads-weekly.json` — latest weekly snapshot
- `data/ads-changelog.json` — append-only action + decision log
- `google-ads.yaml` — credentials (gitignored)
- Add Google tag to all HTML pages

---

## Current blockers (in order)

1. ❌ MCC link not approved (f4investas 2FA) → see #3
2. ❌ Developer token not applied for
3. ❌ No conversion tracking on site
4. ❌ Pricing page not built → see #1 (needed for pricing intent campaign)
