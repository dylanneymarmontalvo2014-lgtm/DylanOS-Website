(() => {
  const labels = {
    commits: ['commits', 'confirmaciones'],
    stars: ['stars', 'estrellas'],
    contributors: ['contributors', 'colaboradores'],
    releases: ['releases', 'lanzamientos']
  };

  let currentStats = null;
  let requestInFlight = false;

  function formatValue(value) {
    return Number(value).toLocaleString('es-ES');
  }

  function renderGithubStats() {
    document.querySelectorAll('#comunidad .grid.grid-cols-2 > div').forEach(card => {
      const label = card.querySelector('.capitalize');
      const value = card.querySelector('.text-2xl');
      if (!label || !value) return;
      const normalizedLabel = label.textContent.trim().toLowerCase();
      const key = Object.keys(labels).find(stat => labels[stat].includes(normalizedLabel));
      const nextValue = currentStats && key ? currentStats[key] : undefined;
      const formattedValue = nextValue === undefined ? '—' : formatValue(nextValue);
      if (value.textContent !== formattedValue) value.textContent = formattedValue;
    });

    const bars = document.querySelectorAll('#comunidad .mt-4.flex.items-end.gap-1.h-20 > div');
    const activity = currentStats && Array.isArray(currentStats.activity) ? currentStats.activity : [];
    if (!bars.length) return;
    if (!activity.length) {
      bars.forEach(bar => { bar.style.display = 'none'; });
      return;
    }
    const peak = Math.max(...activity, 1);
    bars.forEach((bar, index) => {
      const count = activity[index];
      bar.style.display = '';
      bar.style.height = count === undefined ? '0%' : `${Math.max(8, (count / peak) * 100)}%`;
    });
  }

  async function updateGithubStats() {
    if (requestInFlight) return;
    requestInFlight = true;
    try {
      const response = await fetch('/api/github-stats');
      if (!response.ok) throw new Error('GitHub stats request failed');
      currentStats = await response.json();
      renderGithubStats();
    } catch (error) {
      console.warn('No se pudieron actualizar las estadísticas de GitHub:', error);
    } finally {
      requestInFlight = false;
    }
  }

  renderGithubStats();
  updateGithubStats();
  new MutationObserver(renderGithubStats).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(updateGithubStats, 5 * 60 * 1000);
})();
