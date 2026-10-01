/* Endpoint serverless de estadísticas de GitHub (Vercel).
   Misma lógica que server.js, con caché en memoria por instancia. */
const GITHUB_OWNER = 'dylanneymarmontalvo2014-lgtm';
const GITHUB_REPOSITORY = 'DylanOS-Website';
const GITHUB_CACHE_TTL = 60 * 1000;
let githubCache = null;

async function githubRequest(pathname) {
  const response = await fetch(`https://api.github.com${pathname}`, {
    headers: {
      'User-Agent': 'DylanOS-Website',
      ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {})
    }
  });
  if (!response.ok) throw new Error(`GitHub API respondió ${response.status}`);
  return { data: await response.json(), link: response.headers.get('link') };
}

function getLastPage(linkHeader) {
  const lastPage = linkHeader && linkHeader.match(/[?&]page=(\d+)>; rel="last"/);
  return lastPage ? Number(lastPage[1]) : 1;
}

function getCollectionCount(result) {
  return result.data.length === 0 ? 0 : getLastPage(result.link);
}

async function getGithubStats() {
  if (githubCache && Date.now() - githubCache.timestamp < GITHUB_CACHE_TTL) {
    return githubCache.data;
  }
  const repositoryPath = `/repos/${GITHUB_OWNER}/${GITHUB_REPOSITORY}`;
  const [repository, commits, contributors, releases] = await Promise.all([
    githubRequest(repositoryPath),
    githubRequest(`${repositoryPath}/commits?per_page=1`),
    githubRequest(`${repositoryPath}/contributors?per_page=1&anon=true`),
    githubRequest(`${repositoryPath}/releases?per_page=1`)
  ]);
  const data = {
    commits: getCollectionCount(commits),
    stars: repository.data.stargazers_count,
    contributors: getCollectionCount(contributors),
    releases: getCollectionCount(releases)
  };
  githubCache = { data, timestamp: Date.now() };
  return data;
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  try {
    const data = await getGithubStats();
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(data);
  } catch (error) {
    console.error('No se pudieron obtener las estadísticas de GitHub:', error.message);
    res.status(502).json({ error: 'No se pudieron obtener las estadísticas de GitHub' });
  }
};
