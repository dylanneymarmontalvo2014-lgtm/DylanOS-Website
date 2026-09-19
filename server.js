const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 5500;
const GITHUB_OWNER = 'dylanneymarmontalvo2014-lgtm';
const GITHUB_REPOSITORY = 'DylanOS';
const GITHUB_CACHE_TTL = 60 * 1000;
let githubCache = null;

function githubRequest(endpoint) {
  return new Promise((resolve, reject) => {
    const request = https.request({
      hostname: 'api.github.com',
      path: endpoint,
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'DylanOS-Website',
        ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {})
      }
    }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`GitHub API respondió ${response.statusCode}`));
          return;
        }
        try {
          resolve({ data: JSON.parse(body), headers: response.headers });
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on('error', reject);
    request.end();
  });
}

function getLastPage(linkHeader) {
  const lastPage = linkHeader && linkHeader.match(/[?&]page=(\d+)>; rel="last"/);
  return lastPage ? Number(lastPage[1]) : 1;
}

function getCollectionCount(result) {
  return result.data.length === 0 ? 0 : getLastPage(result.headers.link);
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

function sendGithubStats(res) {
  getGithubStats().then(data => {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(data));
  }).catch(error => {
    console.error('No se pudieron obtener las estadísticas de GitHub:', error.message);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'No se pudieron obtener las estadísticas de GitHub' }));
  });
}

// Extensiones estáticas que deben servirse directamente
const staticExtensions = ['.js', '.css', '.png', '.webp', '.jpg', '.ico', '.svg', '.woff', '.woff2'];

const server = http.createServer((req, res) => {
  if (req.url === '/api/github-stats') {
    sendGithubStats(res);
    return;
  }

  let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);

  fs.readFile(filePath, (err, content) => {
    if (err) {
      const isStatic = staticExtensions.some(ext => filePath.endsWith(ext));
      if (isStatic) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
        return;
      }

      fs.readFile(path.join(__dirname, '404.html'), (notFoundErr, notFoundContent) => {
        if (notFoundErr) {
          res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<!DOCTYPE html><html><body><h1>404 Not Found</h1></body></html>');
          return;
        }

        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(notFoundContent);
      });
      return;
    } else {
      let contentType = 'text/html';
      if (filePath.endsWith('.js')) contentType = 'application/javascript';
      if (filePath.endsWith('.css')) contentType = 'text/css';
      if (filePath.endsWith('.png')) contentType = 'image/png';
      if (filePath.endsWith('.webp')) contentType = 'image/webp';
      if (filePath.endsWith('.jpg')) contentType = 'image/jpeg';
      if (filePath.endsWith('.ico')) contentType = 'image/x-icon';
      if (filePath.endsWith('.svg')) contentType = 'image/svg+xml';
      if (filePath.endsWith('.woff')) contentType = 'font/woff';
      if (filePath.endsWith('.woff2')) contentType = 'font/woff2';
      
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Servidor ejecutándose en http://127.0.0.1:${PORT}`);
});
