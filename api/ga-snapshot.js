const { GoogleAuth } = require('google-auth-library');

const GA4_PROPERTY_ID = '531068491';
const REPO_OWNER = 'timothyylim';
const REPO_NAME = 'piperehabilitering';
const DATA_PATH = 'data/ga-history.json';
const BACKFILL_DEFAULT_START = '2026-01-01';

async function getGaClient() {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    const auth = new GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
    });
    return auth.getClient();
}

async function gaFetch(client, body) {
    const url = `https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY_ID}:runReport`;
    const res = await client.request({ url, method: 'POST', data: body });
    return res.data;
}

function fmtDate(d) {
    return d.toISOString().split('T')[0];
}

function addDays(dateStr, days) {
    const d = new Date(dateStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return fmtDate(d);
}

// Current-week snapshot range: a 7-day window ending 3 days ago
// (GA4 data is usually stable after 24-48h; the 3-day buffer is a safety margin).
function currentWeekRange() {
    const today = new Date();
    const end = new Date(today);
    end.setUTCDate(today.getUTCDate() - 3);
    const start = new Date(end);
    start.setUTCDate(end.getUTCDate() - 6);
    return { startDate: fmtDate(start), endDate: fmtDate(end) };
}

async function fetchRangeSnapshot(client, range) {
    const [overall, pages, sources, devices, countries, daily] = await Promise.all([
        gaFetch(client, {
            dateRanges: [range],
            metrics: [
                { name: 'totalUsers' },
                { name: 'screenPageViews' },
                { name: 'sessions' },
                { name: 'averageSessionDuration' },
                { name: 'bounceRate' },
                { name: 'engagementRate' },
            ],
        }),
        gaFetch(client, {
            dateRanges: [range],
            dimensions: [{ name: 'pagePath' }],
            metrics: [{ name: 'screenPageViews' }, { name: 'totalUsers' }],
            orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
            limit: 50,
        }),
        gaFetch(client, {
            dateRanges: [range],
            dimensions: [{ name: 'sessionSource' }],
            metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
            orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
            limit: 50,
        }),
        gaFetch(client, {
            dateRanges: [range],
            dimensions: [{ name: 'deviceCategory' }],
            metrics: [{ name: 'totalUsers' }, { name: 'sessions' }],
            orderBys: [{ metric: { metricName: 'totalUsers' }, desc: true }],
        }),
        gaFetch(client, {
            dateRanges: [range],
            dimensions: [{ name: 'country' }],
            metrics: [{ name: 'totalUsers' }, { name: 'sessions' }],
            orderBys: [{ metric: { metricName: 'totalUsers' }, desc: true }],
            limit: 20,
        }),
        gaFetch(client, {
            dateRanges: [range],
            dimensions: [{ name: 'date' }],
            metrics: [{ name: 'totalUsers' }, { name: 'screenPageViews' }, { name: 'sessions' }],
            orderBys: [{ dimension: { dimensionName: 'date' }, desc: false }],
        }),
    ]);

    return {
        capturedAt: new Date().toISOString(),
        range,
        overall: overall.rows?.[0]?.metricValues || [],
        pages: pages.rows || [],
        sources: sources.rows || [],
        devices: devices.rows || [],
        countries: countries.rows || [],
        daily: daily.rows || [],
    };
}

async function ghGet(path) {
    const res = await fetch(
        `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`,
        {
            headers: {
                Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
                Accept: 'application/vnd.github+json',
            },
        }
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub GET ${path}: ${res.status} ${await res.text()}`);
    return res.json();
}

async function ghPut(path, message, content, sha) {
    const body = {
        message,
        content: Buffer.from(content).toString('base64'),
        branch: 'main',
    };
    if (sha) body.sha = sha;

    const res = await fetch(
        `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`,
        {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
                Accept: 'application/vnd.github+json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        }
    );
    if (!res.ok) throw new Error(`GitHub PUT ${path}: ${res.status} ${await res.text()}`);
    return res.json();
}

function alreadyCaptured(history, range) {
    return history.some(
        (s) => s.range?.startDate === range.startDate && s.range?.endDate === range.endDate
    );
}

// Generate 7-day buckets from start to end (end exclusive on the last partial week).
// Each bucket represents a full 7-day window aligned to its startDate.
function weeklyBuckets(startDate, endDate) {
    const buckets = [];
    let cursor = startDate;
    while (cursor <= endDate) {
        const bucketEnd = addDays(cursor, 6);
        if (bucketEnd > endDate) break;
        buckets.push({ startDate: cursor, endDate: bucketEnd });
        cursor = addDays(cursor, 7);
    }
    return buckets;
}

module.exports = async function handler(req, res) {
    const auth = req.headers.authorization || '';
    const adminPw = req.headers['x-admin-password'];
    const isCron = process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
    const isAdmin = process.env.ADMIN_PASSWORD && adminPw === process.env.ADMIN_PASSWORD;
    if (!isCron && !isAdmin) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const client = await getGaClient();

        // Load existing history
        const existing = await ghGet(DATA_PATH);
        let history = [];
        let sha;
        if (existing) {
            const content = Buffer.from(existing.content, 'base64').toString();
            history = JSON.parse(content);
            sha = existing.sha;
        }

        // Determine which ranges to fetch
        const backfill = req.query.backfill === '1' || req.query.backfill === 'true';
        let ranges;

        if (backfill) {
            // Backfill mode: iterate weekly buckets from start → today-3
            const start = req.query.start || BACKFILL_DEFAULT_START;
            const endAnchor = currentWeekRange().endDate;
            ranges = weeklyBuckets(start, endAnchor);
        } else {
            // Normal mode: just the most recent complete week
            ranges = [currentWeekRange()];
        }

        // Skip ranges we already have
        const newRanges = ranges.filter((r) => !alreadyCaptured(history, r));
        if (newRanges.length === 0) {
            return res.status(200).json({
                ok: true,
                skipped: 'all ranges already captured',
                historyCount: history.length,
            });
        }

        // Fetch each new range
        const captured = [];
        for (const r of newRanges) {
            const snapshot = await fetchRangeSnapshot(client, r);
            history.push(snapshot);
            captured.push(r);
        }

        // Sort history by startDate for cleaner diffs
        history.sort((a, b) => (a.range?.startDate || '').localeCompare(b.range?.startDate || ''));

        const newContent = JSON.stringify(history, null, 2);
        const msg = backfill
            ? `ga backfill: +${captured.length} weekly snapshots`
            : `ga snapshot ${captured[0].endDate}`;
        await ghPut(DATA_PATH, msg, newContent, sha);

        return res.status(200).json({
            ok: true,
            mode: backfill ? 'backfill' : 'weekly',
            captured,
            historyCount: history.length,
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: err.message });
    }
};
