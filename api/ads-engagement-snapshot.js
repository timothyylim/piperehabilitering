const { GoogleAuth } = require('google-auth-library');

const GA4_PROPERTY_ID = '531068491';
const REPO_OWNER = 'timothyylim';
const REPO_NAME = 'piperehabilitering';
const DATA_PATH = 'data/ads-engagement-history.json';
const BACKFILL_DEFAULT_START = '2026-06-01';

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

function currentWeekRange() {
    const today = new Date();
    const end = new Date(today);
    end.setUTCDate(today.getUTCDate() - 3);
    const start = new Date(end);
    start.setUTCDate(end.getUTCDate() - 6);
    return { startDate: fmtDate(start), endDate: fmtDate(end) };
}

// Paid Search filter — matches GA4 default channel group
const PAID_SEARCH_FILTER = {
    filter: {
        fieldName: 'sessionDefaultChannelGroup',
        stringFilter: { matchType: 'EXACT', value: 'Paid Search' },
    },
};

async function fetchRangeSnapshot(client, range) {
    const base = { dateRanges: [range], dimensionFilter: PAID_SEARCH_FILTER };

    const [overall, pages, daily] = await Promise.all([
        gaFetch(client, {
            ...base,
            metrics: [
                { name: 'sessions' },
                { name: 'totalUsers' },
                { name: 'engagementRate' },
                { name: 'bounceRate' },
                { name: 'averageSessionDuration' },
                { name: 'screenPageViews' },
                { name: 'conversions' },
            ],
        }),
        gaFetch(client, {
            ...base,
            dimensions: [{ name: 'pagePath' }],
            metrics: [
                { name: 'sessions' },
                { name: 'engagementRate' },
                { name: 'averageSessionDuration' },
                { name: 'conversions' },
            ],
            orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
            limit: 20,
        }),
        gaFetch(client, {
            ...base,
            dimensions: [{ name: 'date' }],
            metrics: [{ name: 'sessions' }, { name: 'engagementRate' }, { name: 'conversions' }],
            orderBys: [{ dimension: { dimensionName: 'date' }, desc: false }],
        }),
    ]);

    const m = overall.rows?.[0]?.metricValues || [];
    const [sessions, users, engagementRate, bounceRate, avgDuration, pageviews, conversions] = m.map(
        (v) => v.value
    );

    return {
        capturedAt: new Date().toISOString(),
        range,
        summary: { sessions, users, engagementRate, bounceRate, avgDuration, pageviews, conversions },
        pages: pages.rows || [],
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
    const body = { message, content: Buffer.from(content).toString('base64'), branch: 'main' };
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

    console.log('[ads-engagement-snapshot] invoked', {
        time: new Date().toISOString(),
        isCron,
        isAdmin,
        query: req.query,
    });

    if (!isCron && !isAdmin) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    if (req.query.test === '1') {
        return res.status(200).json({ ok: true, mode: 'test', authMethod: isCron ? 'cron' : 'admin' });
    }

    try {
        const client = await getGaClient();

        const existing = await ghGet(DATA_PATH);
        let history = [];
        let sha;
        if (existing) {
            history = JSON.parse(Buffer.from(existing.content, 'base64').toString());
            sha = existing.sha;
        }

        const backfill = req.query.backfill === '1' || req.query.backfill === 'true';
        let ranges;
        if (backfill) {
            const start = req.query.start || BACKFILL_DEFAULT_START;
            ranges = weeklyBuckets(start, currentWeekRange().endDate);
        } else {
            ranges = [currentWeekRange()];
        }

        const newRanges = ranges.filter((r) => !alreadyCaptured(history, r));
        if (newRanges.length === 0) {
            return res.status(200).json({ ok: true, skipped: 'all ranges already captured', historyCount: history.length });
        }

        const captured = [];
        for (const r of newRanges) {
            const snapshot = await fetchRangeSnapshot(client, r);
            history.push(snapshot);
            captured.push(r);
        }

        history.sort((a, b) => (a.range?.startDate || '').localeCompare(b.range?.startDate || ''));

        const msg = backfill
            ? `ads engagement backfill: +${captured.length} weekly snapshots`
            : `ads engagement snapshot ${captured[0].range.endDate}`;
        await ghPut(DATA_PATH, msg, JSON.stringify(history, null, 2), sha);

        console.log('[ads-engagement-snapshot] completed', { captured: captured.length, total: history.length });

        return res.status(200).json({ ok: true, mode: backfill ? 'backfill' : 'weekly', captured, historyCount: history.length });
    } catch (err) {
        console.error('[ads-engagement-snapshot] error', err);
        return res.status(500).json({ error: err.message });
    }
};
