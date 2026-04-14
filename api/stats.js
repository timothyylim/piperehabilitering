const { GoogleAuth } = require('google-auth-library');

const GA4_PROPERTY_ID = '531068491';

let authClient = null;

async function getAuthClient() {
    if (authClient) return authClient;

    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    const auth = new GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
    });
    authClient = await auth.getClient();
    return authClient;
}

async function gaFetch(client, body) {
    const url = `https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY_ID}:runReport`;
    const res = await client.request({ url, method: 'POST', data: body });
    return res.data;
}

function dateStr(daysAgo) {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().split('T')[0];
}

module.exports = async function handler(req, res) {
    // Password check
    const password = req.headers['x-admin-password'] || req.query.password;
    if (password !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const days = parseInt(req.query.days) || 7;
    const startDate = dateStr(days);
    const endDate = dateStr(0);
    const prevStartDate = dateStr(days * 2 + 1);
    const prevEndDate = dateStr(days + 1);

    try {
        const client = await getAuthClient();

        const overviewMetrics = [
            { name: 'totalUsers' },
            { name: 'screenPageViews' },
            { name: 'sessions' },
            { name: 'averageSessionDuration' },
        ];

        const [overview, overviewPrev, pages, sources, devices, daily] = await Promise.all([
            gaFetch(client, {
                dateRanges: [{ startDate, endDate }],
                metrics: overviewMetrics,
            }),
            gaFetch(client, {
                dateRanges: [{ startDate: prevStartDate, endDate: prevEndDate }],
                metrics: overviewMetrics,
            }),
            gaFetch(client, {
                dateRanges: [{ startDate, endDate }],
                dimensions: [{ name: 'pagePath' }],
                metrics: [{ name: 'screenPageViews' }, { name: 'totalUsers' }],
                orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
                limit: 10,
            }),
            gaFetch(client, {
                dateRanges: [{ startDate, endDate }],
                dimensions: [{ name: 'sessionSource' }],
                metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
                orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
                limit: 10,
            }),
            gaFetch(client, {
                dateRanges: [{ startDate, endDate }],
                dimensions: [{ name: 'deviceCategory' }],
                metrics: [{ name: 'totalUsers' }],
                orderBys: [{ metric: { metricName: 'totalUsers' }, desc: true }],
            }),
            gaFetch(client, {
                dateRanges: [{ startDate, endDate }],
                dimensions: [{ name: 'date' }],
                metrics: [{ name: 'totalUsers' }, { name: 'screenPageViews' }, { name: 'sessions' }],
                orderBys: [{ dimension: { dimensionName: 'date' }, desc: true }],
            }),
        ]);

        res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
        return res.status(200).json({ overview, overviewPrev, pages, sources, devices, daily, days });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to fetch analytics data' });
    }
};
