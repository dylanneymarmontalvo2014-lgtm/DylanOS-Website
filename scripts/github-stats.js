(() => {
  const legacyLabels = {
    commits: ['commits', 'confirmaciones'],
    stars: ['stars', 'estrellas'],
    contributors: ['contributors', 'colaboradores'],
    releases: ['releases', 'lanzamientos']
  };

  function formatValue(value) {
    return Number(value).toLocaleString('es-ES');
  }

  let currentStats = null;
  let requestInFlight = false;

  function renderStats() {
    if (!currentStats) return;
    document.querySelectorAll('[data-repo-stat]').forEach(value => {
      const key = value.getAttribute('data-repo-stat');
      if (currentStats[key] !== undefined) {
        const formattedValue = formatValue(currentStats[key]);
        if (value.textContent !== formattedValue) value.textContent = formattedValue;
      }
    });

    document.querySelectorAll('#comunidad .grid.grid-cols-2 > div').forEach(card => {
      const label = card.querySelector('.capitalize');
      const value = card.querySelector('.text-2xl');
      if (!label || !value) return;
      const normalizedLabel = label.textContent.trim().toLowerCase();
      const key = Object.keys(legacyLabels).find(stat => legacyLabels[stat].includes(normalizedLabel));
      if (!key || currentStats[key] === undefined) return;
      const formattedValue = formatValue(currentStats[key]);
      if (value.textContent !== formattedValue) value.textContent = formattedValue;
    });
  }

  async function updateGithubStats() {
    if (requestInFlight) return;
    requestInFlight = true;
    try {
      const response = await fetch('/api/github-stats');
      if (!response.ok) throw new Error('GitHub stats request failed');
      currentStats = await response.json();
      renderStats();
    } catch (error) {
      console.warn('No se pudieron actualizar las estadísticas de GitHub:', error);
    } finally {
      requestInFlight = false;
    }
  }

  updateGithubStats();
  new MutationObserver(renderStats).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(updateGithubStats, 5 * 60 * 1000);
})();
