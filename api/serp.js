const fs = require('fs/promises');
const path = require('path');

async function readJson(name) {
    const file = path.join(process.cwd(), 'data', name);
    return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function readText(name) {
    const file = path.join(process.cwd(), 'data', name);
    return fs.readFile(file, 'utf8');
}

module.exports = async function handler(req, res) {
    const password = req.headers['x-admin-password'] || req.query.password;
    if (password !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const includeBrief = req.query.brief === '1' || req.query.brief === 'true';
        const [latest, history, brief] = await Promise.all([
            readJson('serp-latest.json').catch(() => null),
            readJson('serp-history.json').catch(() => []),
            includeBrief ? readText('serp-brief.md').catch(() => '') : Promise.resolve(undefined),
        ]);

        res.setHeader('Cache-Control', 'private, no-store');
        return res.status(200).json({ latest, history, brief });
    } catch (err) {
        console.error('[serp] failed', err);
        return res.status(500).json({ error: 'Failed to read SERP data' });
    }
};

