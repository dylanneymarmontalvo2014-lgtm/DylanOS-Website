/* Endpoint serverless de estadísticas de GitHub (Vercel).
   Misma lógica que server.js, con caché en memoria por instancia. */
/* Conectores: configura el repositorio a medir con variables de entorno
   (Vercel → Project Settings → Environment Variables):
     GITHUB_OWNER   → dueño del repo (por defecto: dylanneymarmontalvo2014-lgtm)
     GITHUB_REPO    → nombre del repo (por defecto: DylanOS)
     GITHUB_TOKEN   → token opcional para subir el límite de rate limit */
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'dylanneymarmontalvo2014-lgtm';
const GITHUB_REPOSITORY = process.env.GITHUB_REPO || 'DylanOS';
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

/* /stats/contributors devuelve commits reales por colaborador (rama por defecto).
   GitHub responde 202 la primera vez mientras calcula: en ese caso se devuelve
   null y el llamante usa el método de paginación como respaldo. */
async function getContributorStats(repositoryPath) {
  const response = await fetch(`https://api.github.com${repositoryPath}/stats/contributors`, {
    headers: {
      'User-Agent': 'DylanOS-Website',
      ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {})
    }
  });
  if (response.status === 202) return null;
  if (!response.ok) throw new Error(`GitHub API respondió ${response.status}`);
  const stats = await response.json();
  return Array.isArray(stats) && stats.length > 0 ? stats : null;
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
  const [repository, releases, contributorStats] = await Promise.all([
    githubRequest(repositoryPath),
    githubRequest(`${repositoryPath}/releases?per_page=1`),
    getContributorStats(repositoryPath)
  ]);

  let commits;
  let contributors;
  if (contributorStats) {
    // Cifras reales: suma de commits y número de autores
    commits = contributorStats.reduce((total, entry) => total + entry.total, 0);
    contributors = contributorStats.length;
  } else {
    // Respaldo por paginación mientras GitHub calcula las estadísticas (202)
    const [commitsPage, contributorsPage] = await Promise.all([
      githubRequest(`${repositoryPath}/commits?per_page=1`),
      githubRequest(`${repositoryPath}/contributors?per_page=1&anon=true`)
    ]);
    commits = getCollectionCount(commitsPage);
    contributors = getCollectionCount(contributorsPage);
  }

  const data = {
    commits,
    stars: repository.data.stargazers_count,
    contributors,
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
