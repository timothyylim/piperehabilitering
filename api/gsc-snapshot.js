const { GoogleAuth } = require('google-auth-library');

const GSC_SITE = 'sc-domain:pipe-rehab.no';
const REPO_OWNER = 'timothyylim';
const REPO_NAME = 'piperehabilitering';
const DATA_PATH = 'data/gsc-history.json';

async function getGscClient() {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    const auth = new GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
    });
    return auth.getClient();
}

async function gscQuery(client, body) {
    const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(GSC_SITE)}/searchAnalytics/query`;
    const res = await client.request({ url, method: 'POST', data: body });
    return res.data;
}

function fmtDate(d) {
    return d.toISOString().split('T')[0];
}

async function fetchSnapshot() {
    const client = await getGscClient();

    // GSC data lags by ~2-3 days — snapshot the 7-day window ending 3 days ago
    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(today.getDate() - 3);
    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - 6);

    const range = { startDate: fmtDate(startDate), endDate: fmtDate(endDate) };

    const [overall, queries, pages, countries] = await Promise.all([
        gscQuery(client, { ...range }),
        gscQuery(client, { ...range, dimensions: ['query'], rowLimit: 50 }),
        gscQuery(client, { ...range, dimensions: ['page'], rowLimit: 50 }),
        gscQuery(client, { ...range, dimensions: ['country'], rowLimit: 20 }),
    ]);

    return {
        capturedAt: today.toISOString(),
        range,
        overall: overall.rows?.[0] || { clicks: 0, impressions: 0, ctr: 0, position: 0 },
        queries: queries.rows || [],
        pages: pages.rows || [],
        countries: countries.rows || [],
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

module.exports = async function handler(req, res) {
    // Vercel cron sends `Authorization: Bearer <CRON_SECRET>`. Also allow manual
    // trigger with the admin password header for ad-hoc runs from the dashboard.
    const auth = req.headers.authorization || '';
    const adminPw = req.headers['x-admin-password'];
    const isCron = process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
    const isAdmin = process.env.ADMIN_PASSWORD && adminPw === process.env.ADMIN_PASSWORD;

    console.log('[gsc-snapshot] invoked', {
        time: new Date().toISOString(),
        isCron,
        isAdmin,
        hasCronSecret: !!process.env.CRON_SECRET,
        query: req.query,
        userAgent: req.headers['user-agent'],
    });

    if (!isCron && !isAdmin) {
        console.warn('[gsc-snapshot] unauthorized');
        return res.status(401).json({ error: 'Unauthorized' });
    }

    // Health check mode — returns auth status without fetching or writing
    if (req.query.test === '1') {
        return res.status(200).json({
            ok: true,
            mode: 'test',
            authMethod: isCron ? 'cron' : 'admin',
            time: new Date().toISOString(),
        });
    }

    try {
        const snapshot = await fetchSnapshot();

        const existing = await ghGet(DATA_PATH);
        let history = [];
        let sha;
        if (existing) {
            const content = Buffer.from(existing.content, 'base64').toString();
            history = JSON.parse(content);
            sha = existing.sha;
        }

        // Idempotency: if we already have a snapshot for this exact range, skip
        const alreadyCaptured = history.some(
            (s) => s.range?.startDate === snapshot.range.startDate && s.range?.endDate === snapshot.range.endDate
        );
        if (alreadyCaptured) {
            console.log('[gsc-snapshot] skipped — already captured', snapshot.range);
            return res.status(200).json({ ok: true, skipped: 'already captured', range: snapshot.range });
        }

        history.push(snapshot);
        const newContent = JSON.stringify(history, null, 2);
        await ghPut(DATA_PATH, `gsc snapshot ${snapshot.range.endDate}`, newContent, sha);

        console.log('[gsc-snapshot] completed', {
            range: snapshot.range,
            clicks: snapshot.overall.clicks,
            impressions: snapshot.overall.impressions,
            historyCount: history.length,
        });

        return res.status(200).json({
            ok: true,
            range: snapshot.range,
            clicks: snapshot.overall.clicks,
            impressions: snapshot.overall.impressions,
            position: snapshot.overall.position,
            totalSnapshots: history.length,
        });
    } catch (err) {
        console.error('[gsc-snapshot] error', err);
        return res.status(500).json({ error: err.message });
    }
};
