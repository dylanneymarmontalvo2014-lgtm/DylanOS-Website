(() => {
  const labels = {
    commits: 'confirmaciones',
    stars: 'estrellas',
    contributors: 'colaboradores',
    releases: 'lanzamientos'
  };

  function formatValue(value) {
    return Number(value).toLocaleString('es-ES');
  }

  async function updateGithubStats() {
    try {
      const response = await fetch('/api/github-stats');
      if (!response.ok) throw new Error('GitHub stats request failed');
      const stats = await response.json();
      document.querySelectorAll('#comunidad .grid.grid-cols-2 > div').forEach(card => {
        const label = card.querySelector('.capitalize');
        if (!label) return;
        const key = Object.keys(labels).find(stat => label.textContent.trim().toLowerCase() === labels[stat]);
        if (!key || stats[key] === undefined) return;
        const value = card.querySelector('.text-2xl');
        if (value) value.textContent = formatValue(stats[key]);
      });
    } catch (error) {
      console.warn('No se pudieron actualizar las estadísticas de GitHub:', error);
    }
  }

  // Update every 5 minutes to balance freshness and rate limits
  updateGithubStats();
  setInterval(updateGithubStats, 5 * 60 * 1000);
})();