# Google Ads API Mock — Piperehabilitering AS

Customer ID: `762-918-8870` (f4investas account)
MCC: `719-898-3872` (tim@hyperspeed.studio)

## Setup

```bash
pip install google-ads
```

```yaml
# google-ads.yaml (keep out of git)
developer_token: YOUR_DEV_TOKEN
client_id: YOUR_CLIENT_ID
client_secret: YOUR_CLIENT_SECRET
refresh_token: YOUR_REFRESH_TOKEN
login_customer_id: 719898872  # MCC ID, no dashes
```

---

## 1. Pull campaign stats

```python
from google.ads.googleads.client import GoogleAdsClient

client = GoogleAdsClient.load_from_storage("google-ads.yaml")
ga_service = client.get_service("GoogleAdsService")

CUSTOMER_ID = "762918870"  # f4investas client account

query = """
    SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.phone_calls
    FROM campaign
    WHERE segments.date DURING LAST_30_DAYS
"""

response = ga_service.search(customer_id=CUSTOMER_ID, query=query)

for row in response:
    cost_kr = row.metrics.cost_micros / 1_000_000
    print(f"{row.campaign.name}: {row.metrics.clicks} clicks, {cost_kr:.2f} kr")
```

---

## 2. Pull search terms report (what queries triggered ads)

```python
query = """
    SELECT
        search_term_view.search_term,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions
    FROM search_term_view
    WHERE segments.date DURING LAST_30_DAYS
    ORDER BY metrics.impressions DESC
    LIMIT 50
"""

response = ga_service.search(customer_id=CUSTOMER_ID, query=query)

for row in response:
    print(f"{row.search_term_view.search_term}: {row.metrics.clicks} clicks")
```

---

## 3. Pull keywords + quality scores

```python
query = """
    SELECT
        ad_group_criterion.keyword.text,
        ad_group_criterion.keyword.match_type,
        ad_group_criterion.quality_info.quality_score,
        metrics.impressions,
        metrics.clicks,
        metrics.average_cpc
    FROM keyword_view
    WHERE segments.date DURING LAST_30_DAYS
    ORDER BY metrics.impressions DESC
"""

response = ga_service.search(customer_id=CUSTOMER_ID, query=query)

for row in response:
    cpc_kr = row.metrics.average_cpc / 1_000_000
    print(
        f"{row.ad_group_criterion.keyword.text} "
        f"(QS: {row.ad_group_criterion.quality_info.quality_score}) "
        f"avg CPC: {cpc_kr:.2f} kr"
    )
```

---

## 4. Set up conversion tracking (phone calls)

```python
# This creates a conversion action for phone calls
conversion_action_service = client.get_service("ConversionActionService")
conversion_action_operation = client.get_type("ConversionActionOperation")

conversion_action = conversion_action_operation.create
conversion_action.name = "Telefon - Piperehabilitering"
conversion_action.type_ = client.enums.ConversionActionTypeEnum.PHONE_CALL_FROM_ADS
conversion_action.category = client.enums.ConversionActionCategoryEnum.PHONE_CALL_LEAD
conversion_action.value_settings.default_value = 500.0  # estimated lead value in kr
conversion_action.value_settings.always_use_default_value = True

response = conversion_action_service.mutate_conversion_actions(
    customer_id=CUSTOMER_ID,
    operations=[conversion_action_operation]
)
print(f"Created: {response.results[0].resource_name}")
```

---

## Notes

- All costs come back in **micros** (divide by 1,000,000 to get NOK)
- The MCC `login_customer_id` in the yaml is what lets you query sub-accounts
- GAQL (Google Ads Query Language) is SQL-like — docs: https://developers.google.com/google-ads/api/docs/query/overview
- Need the MCC link approved before any of this works against the f4investas account
