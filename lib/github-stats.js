const CACHE_TTL = 60 * 1000;
let githubCache = null;

function getLastPage(linkHeader) {
  const lastPage = linkHeader && linkHeader.match(/[?&]page=(\d+)>; rel="last"/);
  return lastPage ? Number(lastPage[1]) : 1;
}

function githubHeaders(env) {
  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'DylanOS-Website',
    ...(env.GITHUB_TOKEN ? { Authorization: `Bearer ${env.GITHUB_TOKEN}` } : {})
  };
}

async function githubFetch(fetchImpl, url, headers) {
  const response = await fetchImpl(url, { headers });
  if (!response.ok) throw new Error(`GitHub API respondió ${response.status}`);
  return response;
}

async function getCollectionCount(fetchImpl, url, headers) {
  const response = await githubFetch(fetchImpl, url, headers);
  const data = await response.json();
  return data.length === 0 ? 0 : getLastPage(response.headers.get('link'));
}

async function getCommitActivity(fetchImpl, url, headers) {
  const response = await fetchImpl(url, { headers });
  if (response.status === 202) return [];
  if (!response.ok) throw new Error(`GitHub API respondió ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data)) return [];
  return data.slice(-12).map(week => Math.max(0, Number(week.total) || 0));
}

async function getGithubStats({
  fetchImpl = globalThis.fetch,
  env = process.env,
  now = Date.now
} = {}) {
  if (githubCache && now() - githubCache.timestamp < CACHE_TTL) return githubCache.data;
  if (typeof fetchImpl !== 'function') throw new Error('Fetch no está disponible');

  const owner = env.GITHUB_OWNER || 'dylanneymarmontalvo2014-lgtm';
  const repositoryName = env.GITHUB_REPO || 'DylanOS';
  const repositoryPath = `https://api.github.com/repos/${owner}/${repositoryName}`;
  const headers = githubHeaders(env);
  const [repository, commits, contributors, releases] = await Promise.all([
    githubFetch(fetchImpl, repositoryPath, headers),
    getCollectionCount(fetchImpl, `${repositoryPath}/commits?per_page=1`, headers),
    getCollectionCount(fetchImpl, `${repositoryPath}/contributors?per_page=1&anon=true`, headers),
    getCollectionCount(fetchImpl, `${repositoryPath}/releases?per_page=1`, headers)
  ]);
  const repositoryData = await repository.json();
  let activity = [];
  try {
    activity = await getCommitActivity(fetchImpl, `${repositoryPath}/stats/commit_activity`, headers);
  } catch {
    activity = [];
  }
  const data = {
    commits,
    stars: repositoryData.stargazers_count,
    contributors,
    releases,
    activity
  };
  githubCache = { data, timestamp: now() };
  return data;
}

function resetGithubStatsCache() {
  githubCache = null;
}

module.exports = { getLastPage, getGithubStats, resetGithubStatsCache };
