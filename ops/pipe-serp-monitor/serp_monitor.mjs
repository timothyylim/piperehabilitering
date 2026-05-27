#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const SERPER_URL = 'https://google.serper.dev/search';
const TARGET_DOMAIN = 'pipe-rehab.no';
const PROVIDER = 'serper.dev';
const REQUEST_PARAMS = { gl: 'no', hl: 'no', num: 20 };
const KNOWN_DOMAINS = new Set([
  'norskpiperehabilitering.no',
  'vtpipe.no',
  'varmefag.no',
  'mittanbud.no',
  'proff.no',
  '1881.no',
  'gulesider.no',
  'facebook.com',
  'instagram.com',
]);
const DIRECTORY_DOMAINS = new Set([
  'mittanbud.no',
  'proff.no',
  '1881.no',
  'gulesider.no',
  'facebook.com',
  'instagram.com',
]);

const rankPoints = [
  [1, 10],
  [2, 8],
  [3, 6],
  [5, 4],
  [10, 2],
  [20, 1],
];

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function isoWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function normalizeDomain(urlOrDomain) {
  if (!urlOrDomain) return '';
  try {
    const withProtocol = /^https?:\/\//i.test(urlOrDomain) ? urlOrDomain : `https://${urlOrDomain}`;
    const host = new URL(withProtocol).hostname.toLowerCase();
    return host.replace(/^www\./, '');
  } catch {
    return String(urlOrDomain)
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0]
      .split('?')[0]
      .replace(/\/$/, '');
  }
}

function isTargetDomain(domain) {
  return normalizeDomain(domain) === TARGET_DOMAIN;
}

function pointsForRank(rank) {
  if (!rank) return 0;
  for (const [maxRank, points] of rankPoints) {
    if (rank <= maxRank) return points;
  }
  return 0;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
}

async function serperSearch(apiKey, keyword) {
  const body = {
    q: keyword.query,
    ...REQUEST_PARAMS,
  };
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const res = await fetch(SERPER_URL, {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (res.ok) return res.json();

    const text = await res.text();
    lastError = new Error(`Serper ${res.status} for "${keyword.query}": ${text.slice(0, 300)}`);
    if (![429, 500, 502, 503, 504].includes(res.status) || attempt === 3) throw lastError;
    await sleep(1000 * attempt);
  }
  throw lastError;
}

function analyzeKeyword(keyword, response) {
  const organic = Array.isArray(response.organic) ? response.organic : [];
  const topResults = organic.slice(0, REQUEST_PARAMS.num).map((result, index) => {
    const rank = Number(result.position || index + 1);
    const domain = normalizeDomain(result.link);
    return {
      rank,
      domain,
      title: result.title || '',
      link: result.link || '',
      snippet: result.snippet || '',
    };
  });

  const our = topResults.find(r => isTargetDomain(r.domain));
  const competitorDomains = [...new Set(topResults
    .filter(r => r.domain && !isTargetDomain(r.domain))
    .map(r => r.domain))];
  const directoryHits = topResults
    .filter(r => DIRECTORY_DOMAINS.has(r.domain))
    .map(r => ({ rank: r.rank, domain: r.domain, title: r.title, link: r.link }));

  return {
    ...keyword,
    request: { ...REQUEST_PARAMS },
    ourRank: our?.rank || null,
    ourUrl: our?.link || null,
    topCompetitor: topResults.find(r => r.domain && !isTargetDomain(r.domain)) || null,
    competitorDomains,
    directoryHits,
    topResults,
    rawCount: organic.length,
  };
}

function computeVisibility(keywordResults) {
  const scores = new Map();

  for (const kw of keywordResults) {
    const seen = new Set();
    for (const result of kw.topResults || []) {
      if (!result.domain || seen.has(result.domain)) continue;
      seen.add(result.domain);
      const current = scores.get(result.domain) || {
        domain: result.domain,
        score: 0,
        appearances: 0,
        top3: 0,
        bestRank: null,
        keywords: [],
      };
      const score = pointsForRank(result.rank) * Number(kw.weight || 1);
      current.score += score;
      current.appearances += 1;
      if (result.rank <= 3) current.top3 += 1;
      current.bestRank = current.bestRank ? Math.min(current.bestRank, result.rank) : result.rank;
      current.keywords.push({ query: kw.query, rank: result.rank, score });
      scores.set(result.domain, current);
    }
  }

  return [...scores.values()]
    .sort((a, b) => b.score - a.score || a.bestRank - b.bestRank || a.domain.localeCompare(b.domain));
}

function previousScoreMap(history) {
  const prev = history.length ? history[history.length - 1] : null;
  const map = new Map();
  for (const row of prev?.visibilityScores || []) {
    map.set(row.domain, Number(row.score || 0));
  }
  return map;
}

function addDeltas(scores, history) {
  const prev = previousScoreMap(history);
  return scores.map(row => ({
    ...row,
    previousScore: prev.has(row.domain) ? prev.get(row.domain) : null,
    delta: prev.has(row.domain) ? row.score - prev.get(row.domain) : null,
  }));
}

function buildAlerts(keywordResults, visibilityScores) {
  const alerts = [];
  const high = keywordResults.filter(k => k.priority === 'high');

  for (const kw of high) {
    if (!kw.ourRank || kw.ourRank > 10) {
      alerts.push({
        severity: 'high',
        type: 'target_absent_top10',
        query: kw.query,
        message: `pipe-rehab.no is not top 10 for "${kw.query}".`,
      });
    }
  }

  for (const query of ['piperehabilitering skien', 'piperehabilitering porsgrunn']) {
    const kw = keywordResults.find(k => k.query === query);
    if (kw && (!kw.ourRank || kw.ourRank > 3)) {
      alerts.push({
        severity: 'high',
        type: 'priority_keyword_below_top3',
        query,
        rank: kw.ourRank,
        message: `pipe-rehab.no is ${kw.ourRank ? `#${kw.ourRank}` : 'absent'} for "${query}", below the top-3 target.`,
      });
    }
  }

  for (const kw of high) {
    for (const result of kw.topResults.filter(r => r.rank <= 3)) {
      if (KNOWN_DOMAINS.has(result.domain) && !isTargetDomain(result.domain)) {
        alerts.push({
          severity: 'medium',
          type: 'known_competitor_top3',
          query: kw.query,
          domain: result.domain,
          rank: result.rank,
          message: `${result.domain} is #${result.rank} for "${kw.query}".`,
        });
      }
    }
  }

  for (const kw of keywordResults.filter(k => ['high', 'medium'].includes(k.priority))) {
    for (const hit of kw.directoryHits || []) {
      if (!kw.ourRank || hit.rank < kw.ourRank) {
        alerts.push({
          severity: 'medium',
          type: 'directory_outranks_target',
          query: kw.query,
          domain: hit.domain,
          rank: hit.rank,
          targetRank: kw.ourRank,
          message: `${hit.domain} outranks pipe-rehab.no for "${kw.query}".`,
        });
      }
    }
  }

  const top5UnknownCounts = new Map();
  for (const kw of keywordResults) {
    for (const result of kw.topResults.filter(r => r.rank <= 5)) {
      if (isTargetDomain(result.domain) || KNOWN_DOMAINS.has(result.domain)) continue;
      top5UnknownCounts.set(result.domain, (top5UnknownCounts.get(result.domain) || 0) + 1);
    }
  }
  for (const [domain, count] of top5UnknownCounts) {
    if (count >= 2) {
      alerts.push({
        severity: 'low',
        type: 'new_domain_repeated_top5',
        domain,
        count,
        message: `${domain} appears top 5 for ${count} monitored keywords.`,
      });
    }
  }

  if (!visibilityScores.some(s => isTargetDomain(s.domain))) {
    alerts.push({
      severity: 'high',
      type: 'target_no_visibility',
      message: 'pipe-rehab.no did not appear in any monitored top-20 SERP results.',
    });
  }

  return alerts;
}

function summarizeStanding(snapshot) {
  const target = snapshot.visibilityScores.find(s => isTargetDomain(s.domain));
  const competitors = snapshot.visibilityScores.filter(s => !isTargetDomain(s.domain));
  const leader = snapshot.visibilityScores[0] || null;
  const targetRank = snapshot.visibilityScores.findIndex(s => isTargetDomain(s.domain)) + 1;
  return {
    targetScore: target?.score || 0,
    targetVisibilityRank: targetRank || null,
    leader: leader ? { domain: leader.domain, score: leader.score } : null,
    topCompetitors: competitors.slice(0, 6).map(c => ({
      domain: c.domain,
      score: c.score,
      delta: c.delta,
      bestRank: c.bestRank,
      top3: c.top3,
    })),
  };
}

function makeBrief(snapshot) {
  const standing = summarizeStanding(snapshot);
  const target = snapshot.visibilityScores.find(s => isTargetDomain(s.domain));
  const wins = snapshot.keywords
    .filter(k => k.ourRank && k.ourRank <= 3)
    .map(k => `${k.query}: #${k.ourRank}`);
  const misses = snapshot.keywords
    .filter(k => ['high', 'medium'].includes(k.priority) && (!k.ourRank || k.ourRank > 10))
    .map(k => `${k.query}: ${k.ourRank ? `#${k.ourRank}` : 'not top 20'}`);
  const priority = snapshot.keywords
    .filter(k => k.priority === 'high')
    .map(k => `- ${k.query}: pipe-rehab.no ${k.ourRank ? `#${k.ourRank}` : 'not top 20'}; top competitor ${k.topCompetitor ? `${k.topCompetitor.domain} #${k.topCompetitor.rank}` : 'none'}`);

  const lines = [
    '# Pipe Rehab SERP Brief',
    '',
    `Captured: ${snapshot.capturedAt}`,
    `Provider: ${snapshot.provider}`,
    `Market: Google Norway (gl=no, hl=no)`,
    '',
    '## Overall Standing',
    '',
    target
      ? `pipe-rehab.no visibility score is ${target.score} and ranks #${standing.targetVisibilityRank} among observed domains.`
      : 'pipe-rehab.no did not appear in the monitored top-20 results.',
    standing.leader
      ? `Current visibility leader: ${standing.leader.domain} (${standing.leader.score}).`
      : 'No visibility leader could be calculated.',
    '',
    '## Top Competitors',
    '',
    ...(standing.topCompetitors.length
      ? standing.topCompetitors.map(c => `- ${c.domain}: score ${c.score}${c.delta === null ? '' : ` (${c.delta >= 0 ? '+' : ''}${c.delta})`}, best rank #${c.bestRank}, top-3 appearances ${c.top3}`)
      : ['- None observed']),
    '',
    '## Priority Keywords',
    '',
    ...priority,
    '',
    '## Wins',
    '',
    ...(wins.length ? wins.map(w => `- ${w}`) : ['- No top-3 monitored wins this snapshot.']),
    '',
    '## Misses',
    '',
    ...(misses.length ? misses.map(m => `- ${m}`) : ['- No high/medium priority keywords missing from top 10.']),
    '',
    '## Alerts',
    '',
    ...(snapshot.alerts.length
      ? snapshot.alerts.slice(0, 20).map(a => `- [${a.severity}] ${a.message}`)
      : ['- No alerts.']),
    '',
    '## Recommended Next Actions',
    '',
    '- Prioritize content and entity work for any high-priority query where pipe-rehab.no is below top 3.',
    '- If directories or social profiles outrank the site, strengthen corresponding owned profiles and sameAs/entity links.',
    '- If Norsk Piperehabilitering leads visibility, compare its ranking pages against pipe-rehab service/city page coverage.',
    '',
  ];

  return `${lines.join('\n')}\n`;
}

function ensureLlmsPointer(text) {
  const pointer = '- [SERP brief](https://www.pipe-rehab.no/data/serp-brief.md)';
  if (text.includes(pointer)) return text;
  if (text.includes('## Lenker')) {
    return text.replace('## Lenker', `## SEO-overvåking\n\n${pointer}\n\n## Lenker`);
  }
  return `${text.trim()}\n\n## SEO-overvåking\n\n${pointer}\n`;
}

async function main() {
  const apiKey = required('SERPER_API_KEY');
  const repoPath = required('REPO_PATH');
  const force = process.env.FORCE === '1' || process.env.FORCE === 'true';
  const appDir = path.dirname(new URL(import.meta.url).pathname);
  const keywords = JSON.parse(await fs.readFile(path.join(appDir, 'keywords.json'), 'utf8'));
  const dataDir = path.join(repoPath, 'data');
  const historyFile = path.join(dataDir, 'serp-history.json');
  const latestFile = path.join(dataDir, 'serp-latest.json');
  const briefFile = path.join(dataDir, 'serp-brief.md');
  const llmsFile = path.join(repoPath, 'llms.txt');
  const history = await readJson(historyFile, []);
  const date = todayIsoDate();
  const week = isoWeekKey();

  if (!force && history.some(s => s.date === date)) {
    console.log(`serp snapshot skipped: ${date} already exists`);
    return;
  }

  const keywordResults = [];
  for (const keyword of keywords) {
    console.log(`search: ${keyword.query}`);
    const response = await serperSearch(apiKey, keyword);
    keywordResults.push(analyzeKeyword(keyword, response));
    await sleep(250);
  }

  const visibilityScores = addDeltas(computeVisibility(keywordResults), history);
  const snapshot = {
    capturedAt: new Date().toISOString(),
    date,
    week,
    provider: PROVIDER,
    request: { ...REQUEST_PARAMS },
    targetDomain: TARGET_DOMAIN,
    keywords: keywordResults,
    visibilityScores,
    alerts: buildAlerts(keywordResults, visibilityScores),
  };
  snapshot.summary = summarizeStanding(snapshot);

  const nextHistory = history.filter(s => s.date !== date);
  nextHistory.push(snapshot);
  nextHistory.sort((a, b) => String(a.capturedAt).localeCompare(String(b.capturedAt)));

  await writeJson(historyFile, nextHistory);
  await writeJson(latestFile, snapshot);
  await fs.writeFile(briefFile, makeBrief(snapshot));

  try {
    const llms = await fs.readFile(llmsFile, 'utf8');
    await fs.writeFile(llmsFile, ensureLlmsPointer(llms));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  console.log(`serp snapshot written: ${snapshot.week}`);
  console.log(`keywords=${snapshot.keywords.length} alerts=${snapshot.alerts.length}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
