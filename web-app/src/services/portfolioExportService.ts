import { BADGES } from '../badges/badges';
import type { SessionMeta, BadgeId, DesignJournalEntry } from '../storage/schema';
import type { Sample } from '../types';

function escapeHtml(input: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return input.replace(/[&<>"']/g, (ch) => map[ch]);
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-z0-9]+/gi, '_').replace(/_+/g, '_').slice(0, 60);
}

function getGestureEmoji(name: string): string {
  const normalized = name.toLowerCase();
  if (normalized.includes('wave')) return '👋';
  if (normalized.includes('shake')) return '🤝';
  if (normalized.includes('circle')) return '⭕';
  if (normalized.includes('spin')) return '🌀';
  if (normalized.includes('point')) return '👉';
  return '🎯';
}

function badgeListHtml(badgeIds: BadgeId[]): string {
  if (badgeIds.length === 0) {
    return '<p class="muted">No badges yet - keep building.</p>';
  }
  return badgeIds
    .map((id) => {
      const badge = BADGES[id];
      return `<span class="badge">${badge.icon} ${escapeHtml(badge.name)}</span>`;
    })
    .join('');
}

export function generatePortfolioHtml(
  meta: SessionMeta,
  samples: Sample[],
  journal: DesignJournalEntry[],
  anonymized = false,
): string {
  const title = meta.projectBrief?.name || 'My Edge AI Project';
  const studentName = anonymized
    ? 'Severn Student'
    : meta.projectBrief?.studentName || meta.studentDisplayName || 'Severn Student';
  const problem = meta.projectBrief?.problemStatement ?? '';
  const gestures = meta.gestures
    .map(
      (g) =>
        `<div class="gesture"><span class="emoji">${getGestureEmoji(g.name)}</span><span>${escapeHtml(
          g.name,
        )}</span></div>`,
    )
    .join('');

  const reflections = journal
    .map(
      (entry) =>
        `<blockquote><strong>${entry.prompt.replace(
          /-/g,
          ' ',
        )}:</strong> ${escapeHtml(entry.response)}</blockquote>`,
    )
    .join('');

  const totalSamples = samples.length;
  const formattedDate = new Date(meta.updatedAt).toLocaleDateString();

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)} - Severn Edge AI Portfolio</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; background: #f8fafc; color: #0f172a; }
    .wrap { max-width: 820px; margin: 24px auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 28px; }
    .muted { color: #64748b; }
    .badge { display: inline-block; margin: 4px; padding: 6px 12px; border-radius: 9999px; border: 1px solid #fcd34d; background: #fef3c7; font-size: 13px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; background: #f8fafc; }
    .gesture { display: inline-flex; align-items: center; gap: 8px; margin: 6px; padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 10px; background: #fff; }
    .emoji { font-size: 18px; }
    blockquote { margin: 8px 0; padding: 10px 12px; border-left: 3px solid #2563eb; background: #eff6ff; border-radius: 0 8px 8px 0; }
    .print-btn { margin-top: 16px; }
    @media print { body { background: #fff; } .wrap { border: none; margin: 0; } .print-btn { display: none; } }
    @media (max-width: 700px) { .grid { grid-template-columns: 1fr; } .wrap { margin: 0; border-radius: 0; } }
  </style>
</head>
<body>
  <main class="wrap">
    <h1>Severn Edge AI Portfolio</h1>
    <p class="muted">Updated ${escapeHtml(formattedDate)}</p>
    <h2>${escapeHtml(studentName)}</h2>
    <p><strong>Project:</strong> ${escapeHtml(title)}</p>
    ${
      problem
        ? `<p><strong>Problem solved:</strong> <em>${escapeHtml(problem)}</em></p>`
        : ''
    }

    <section class="grid">
      <div class="card">
        <h3>Training Summary</h3>
        <p>Total samples: <strong>${totalSamples}</strong></p>
        <p>Gestures: <strong>${meta.gestures.length}</strong></p>
        <p>Accuracy: <strong>${
          meta.trainingAccuracy !== null
            ? `${Math.round(meta.trainingAccuracy * 100)}%`
            : 'Not recorded'
        }</strong></p>
      </div>
      <div class="card">
        <h3>Badges</h3>
        ${badgeListHtml(meta.badgeIds)}
      </div>
    </section>

    <section class="card" style="margin-top:14px;">
      <h3>Gestures</h3>
      ${gestures || '<p class="muted">No gestures saved.</p>'}
    </section>

    <section class="card" style="margin-top:14px;">
      <h3>Reflections</h3>
      ${reflections || '<p class="muted">No reflections saved yet.</p>'}
    </section>

    <section class="card" style="margin-top:14px;">
      <h3>What is Edge AI?</h3>
      <p>Edge AI runs machine learning on the device itself instead of sending data to the cloud for every prediction.</p>
    </section>

    <div class="print-btn">
      <button onclick="window.print()">Print this page</button>
    </div>
  </main>
</body>
</html>`;
}

export function downloadPortfolio(
  meta: SessionMeta,
  samples: Sample[],
  journal: DesignJournalEntry[],
  anonymized = false,
): void {
  const html = generatePortfolioHtml(meta, samples, journal, anonymized);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date().toISOString().split('T')[0];
  const filenameBase = sanitizeFilename(meta.projectBrief?.name || 'Severn_Edge_AI_Portfolio');
  a.href = url;
  a.download = `${filenameBase}_${anonymized ? 'anonymized_' : ''}${date}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

