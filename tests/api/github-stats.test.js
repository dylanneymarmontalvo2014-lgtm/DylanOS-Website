const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getLastPage,
  getGithubStats,
  resetGithubStatsCache
} = require('../../lib/github-stats');

test('lee la última página del encabezado Link de GitHub', () => {
  assert.equal(getLastPage('<https://api.github.com/repos/example/DylanOS/commits?page=42>; rel="last"'), 42);
  assert.equal(getLastPage(null), 1);
});

test('obtiene métricas y actividad reales del repositorio DylanOS', async () => {
  resetGithubStatsCache();
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/repos/dylanneymarmontalvo2014-lgtm/DylanOS')) {
      return new Response(JSON.stringify({ stargazers_count: 17 }), { status: 200 });
    }
    if (url.includes('/stats/commit_activity')) {
      return new Response(JSON.stringify([
        { total: 2 },
        { total: 7 },
        { total: 4 }
      ]), { status: 200 });
    }
    const headers = url.includes('/commits')
      ? { link: '<https://api.github.com?page=23>; rel="last"' }
      : url.includes('/contributors')
        ? { link: '<https://api.github.com?page=5>; rel="last"' }
        : { link: '<https://api.github.com?page=3>; rel="last"' };
    return new Response(JSON.stringify([{}]), { status: 200, headers });
  };

  const stats = await getGithubStats({
    fetchImpl,
    env: { GITHUB_OWNER: 'dylanneymarmontalvo2014-lgtm', GITHUB_REPO: 'DylanOS' }
  });

  assert.deepEqual(stats, {
    commits: 23,
    stars: 17,
    contributors: 5,
    releases: 3,
    activity: [2, 7, 4]
  });
  assert.ok(calls.every(call => call.options.headers['User-Agent'] === 'DylanOS-Website'));
  assert.ok(calls.some(call => call.url.includes('/repos/dylanneymarmontalvo2014-lgtm/DylanOS')));
});
