// Shared JavaScript for small site-wide behaviours.
document.addEventListener('DOMContentLoaded', () => {
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach((link) => {
    if (link.getAttribute('href') === currentPage) link.classList.add('active');
  });

  const scoreBody = document.getElementById('weighted-score-body');
  if (scoreBody) renderWeightedScores(scoreBody);
});

function renderWeightedScores(scoreBody) {
  if (typeof XLSX === 'undefined') {
    setScoreMessage(scoreBody, 'Unable to load score table: spreadsheet library is unavailable.');
    return;
  }

  fetch('assets/data/Scores.xlsx')
    .then((response) => {
      if (!response.ok) throw new Error('Workbook request failed.');
      return response.arrayBuffer();
    })
    .then((arrayBuffer) => {
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error('No worksheet found.');

      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });
      const unitScores = computeWeightedUnitScores(rows);
      populateScoreTable(scoreBody, unitScores);
    })
    .catch(() => {
      setScoreMessage(scoreBody, 'Scores are temporarily unavailable.');
    });
}

function computeWeightedUnitScores(rows) {
  const grouped = new Map();

  rows.forEach((row) => {
    const level = toNumber(row.Level);
    const subject = typeof row.Subject === 'string' ? row.Subject.trim() : '';
    const weight = toNumber(row.Weight);
    const score = toNumber(row.Score);

    if (!subject) return;

    const key = `${Number.isFinite(level) ? level : 'NA'}|${subject}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        level: Number.isFinite(level) ? level : '-',
        subject,
        weightedTotal: 0,
        assessedWeight: 0,
        totalWeight: 0,
      });
    }

    const unit = grouped.get(key);
    if (Number.isFinite(weight) && weight > 0) {
      unit.totalWeight += weight;
    }

    if (Number.isFinite(score) && Number.isFinite(weight) && weight > 0) {
      unit.weightedTotal += score * weight;
      unit.assessedWeight += weight;
    }
  });

  return Array.from(grouped.values())
    .map((unit) => {
      const weightedScore = unit.assessedWeight > 0 ? unit.weightedTotal / unit.assessedWeight : null;
      const assessedCoverage = unit.totalWeight > 0 ? unit.assessedWeight / unit.totalWeight : 0;

      return {
        ...unit,
        weightedScore,
        assessedCoverage,
        assessmentStatus: getAssessmentStatus(unit),
      };
    })
    .sort((a, b) => {
      if (a.level === b.level) return a.subject.localeCompare(b.subject);
      if (a.level === '-') return 1;
      if (b.level === '-') return -1;
      return a.level - b.level;
    });
}

function populateScoreTable(scoreBody, unitScores) {
  scoreBody.innerHTML = '';

  if (!unitScores.length) {
    setScoreMessage(scoreBody, 'No score rows were found in the workbook.');
    return;
  }

  unitScores.forEach((unit) => {
    const tr = document.createElement('tr');

    tr.innerHTML = `
      <td>${unit.level}</td>
      <td>${escapeHtml(unit.subject)}</td>
      <td>${formatScore(unit.weightedScore)}</td>
      <td>${escapeHtml(unit.assessmentStatus)}</td>
    `;

    scoreBody.appendChild(tr);
  });
}

function getAssessmentStatus(unit) {
  if (unit.totalWeight <= 0) return 'Not yet submitted';
  if (unit.assessedWeight <= 0) return 'Submitted, pending marking';
  if (unit.assessedWeight < unit.totalWeight) {
    return `Partially marked (${Math.round((unit.assessedWeight / unit.totalWeight) * 100)}% assessed)`;
  }
  return 'Marked and complete';
}

function setScoreMessage(scoreBody, message) {
  scoreBody.innerHTML = `<tr><td colspan="4">${escapeHtml(message)}</td></tr>`;
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return NaN;
  const num = Number(value);
  return Number.isFinite(num) ? num : NaN;
}

function formatScore(value) {
  if (!Number.isFinite(value)) return 'Pending mark';
  return `${(value * 100).toFixed(1)}%`;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
