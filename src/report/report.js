// AI Visibility Auditor v2 — Full Report Page
// Reads audit data from chrome.storage.local and renders full report

document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get('auditReport', (result) => {
    if (!result.auditReport) {
      document.getElementById('loading').innerHTML = '<p>No audit data found. Run an audit from the extension popup first.</p>';
      return;
    }

    const { url, timestamp, scores, data, recommendations } = result.auditReport;
    renderFullReport(url, timestamp, scores, data, recommendations);
    setupButtons(url, timestamp, scores, data, recommendations);
  });
});

function renderFullReport(url, timestamp, scores, data, recommendations) {
  document.getElementById('loading').classList.add('hidden');
  document.getElementById('report-content').classList.remove('hidden');

  // Header
  document.getElementById('report-url').textContent = url;
  document.getElementById('report-date').textContent = new Date(timestamp).toLocaleString();

  // Overall score
  const card = document.getElementById('overall-score-card');
  const bigScore = document.getElementById('big-score');
  const bigLabel = document.getElementById('big-label');
  const bigSub = document.getElementById('big-sublabel');

  bigScore.textContent = scores.overall;

  if (scores.overall >= 80) {
    card.className = 'overall-score score-green';
    bigLabel.textContent = 'AI-Ready';
    bigSub.textContent = 'Well optimized for AI systems';
  } else if (scores.overall >= 50) {
    card.className = 'overall-score score-yellow';
    bigLabel.textContent = 'Needs Work';
    bigSub.textContent = 'Key areas need improvement';
  } else {
    card.className = 'overall-score score-red';
    bigLabel.textContent = 'Not Optimized';
    bigSub.textContent = 'Significant improvements needed';
  }

  // Score grid
  const categories = [
    { key: 'robots', label: 'Robots Access' },
    { key: 'llms', label: 'LLMs.txt' },
    { key: 'schema', label: 'Schema' },
    { key: 'content', label: 'Content' },
    { key: 'entity', label: 'Entity' },
    { key: 'eeat', label: 'E-E-A-T' },
    { key: 'citeability', label: 'Citeability' },
    { key: 'technical', label: 'Technical' },
    { key: 'performance', label: 'Performance' }
  ];

  const grid = document.getElementById('score-grid');
  grid.innerHTML = categories.map((cat) => {
    const score = scores[cat.key];
    const color = score >= 80 ? '#16a34a' : score >= 50 ? '#ca8a04' : '#dc2626';
    return `<div class="score-card">
      <div class="score-card-label">${cat.label}</div>
      <div class="score-card-value" style="color:${color}">${score}</div>
      <div class="score-card-bar">
        <div class="score-card-fill" style="width:${score}%;background:${color}"></div>
      </div>
    </div>`;
  }).join('');

  // Recommendations
  const recList = document.getElementById('recommendations-list');
  if (recommendations.length === 0) {
    recList.innerHTML = '<p style="color:#16a34a;font-weight:500">No critical fixes needed. Great job!</p>';
  } else {
    recList.innerHTML = recommendations.map((fix, i) => `
      <div class="rec-item">
        <div class="rec-number ${fix.priority}">${i + 1}</div>
        <div class="rec-content">
          <div class="rec-title">${esc(fix.title)}</div>
          <div class="rec-meta">
            <span class="rec-impact">+${esc(fix.impact)} pts</span>
            <span>${esc(fix.effort)}</span>
            <span>${esc(fix.category)}</span>
          </div>
        </div>
      </div>
    `).join('');
  }

  // Detail sections
  renderDetailRobots(data);
  renderDetailLlms(data);
  renderDetailSchema(data);
  renderDetailContent(data);
  renderDetailEntity(data);
  renderDetailEEAT(data);
  renderDetailCiteability(data);
  renderDetailTechnical(data);
  renderDetailPerformance(data);
}

function setupButtons(url, timestamp, scores, data, recommendations) {
  document.getElementById('btn-copy-report').addEventListener('click', function() {
    const md = generateMarkdown(url, timestamp, scores, recommendations);
    navigator.clipboard.writeText(md).then(() => {
      this.classList.add('copied');
      this.textContent = 'Copied!';
      setTimeout(() => {
        this.classList.remove('copied');
        this.textContent = 'Copy as Markdown';
      }, 2000);
    });
  });

  document.getElementById('btn-export-json').addEventListener('click', () => {
    const json = JSON.stringify({ url, timestamp, scores, data, recommendations }, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = 'ai-audit-' + new URL(url).hostname + '.json';
    a.click();
    URL.revokeObjectURL(blobUrl);
  });
}

function generateMarkdown(url, timestamp, scores, recommendations) {
  const lines = [
    '# AI Visibility Audit Report', '',
    '**URL:** ' + url,
    '**Date:** ' + new Date(timestamp).toLocaleString(),
    '**Overall Score:** ' + scores.overall + '/100', '',
    '## Category Scores', '',
    '| Category | Score |', '|----------|-------|',
    '| Robots & Crawler Access | ' + scores.robots + '/100 |',
    '| LLMs.txt | ' + scores.llms + '/100 |',
    '| Schema & Structured Data | ' + scores.schema + '/100 |',
    '| Content Structure | ' + scores.content + '/100 |',
    '| Entity & Authority | ' + scores.entity + '/100 |',
    '| E-E-A-T Signals | ' + scores.eeat + '/100 |',
    '| Content Citeability | ' + scores.citeability + '/100 |',
    '| Technical AI-Readiness | ' + scores.technical + '/100 |',
    '| Page Performance | ' + scores.performance + '/100 |', ''
  ];

  if (recommendations.length > 0) {
    lines.push('## Top Fixes', '');
    recommendations.forEach((fix, i) => {
      lines.push((i + 1) + '. **' + fix.title + '** (Impact: ' + fix.impact + ' pts, Effort: ' + fix.effort + ')');
    });
    lines.push('');
  }

  lines.push('---', '*Generated by AI Visibility Auditor v2*');
  return lines.join('\n');
}

// ─── Detail Renderers ───────────────────────────────────────

function renderDetailRobots(data) {
  const body = document.getElementById('detail-robots-body');
  const robots = data.robots;
  if (!robots) { body.innerHTML = ci('fail', 'Could not fetch robots.txt'); return; }
  if (!robots.found) { body.innerHTML = ci('warn', 'No robots.txt found. All crawlers allowed by default.'); return; }

  let html = '<table class="crawler-table"><tr><th>Crawler</th><th>Owner</th><th>Type</th><th>Status</th><th>Detail</th></tr>';
  robots.crawlers.forEach((c) => {
    const statusClass = 'status-' + c.status;
    const statusText = c.status === 'no-robots' ? 'Default' : c.status.charAt(0).toUpperCase() + c.status.slice(1);
    const typeClass = c.type === 'search' ? 'search' : 'training';
    html += `<tr>
      <td><strong>${esc(c.name)}</strong></td>
      <td class="crawler-owner">${esc(c.owner)}</td>
      <td><span class="crawler-type ${typeClass}">${esc(c.type)}</span></td>
      <td class="${statusClass}">${statusText}</td>
      <td style="font-size:11px;color:#888">${esc(c.detail)}</td>
    </tr>`;
  });
  html += '</table>';

  if (robots.sitemaps && robots.sitemaps.length > 0) {
    html += ci('pass', `<strong>${robots.sitemaps.length}</strong> sitemap${robots.sitemaps.length > 1 ? 's' : ''} declared`);
  } else {
    html += ci('warn', 'No sitemap declared in robots.txt');
  }

  body.innerHTML = html;
}

function renderDetailLlms(data) {
  const body = document.getElementById('detail-llms-body');
  const llms = data.llms;
  if (!llms) { body.innerHTML = ci('fail', 'Could not check'); return; }

  let html = '';
  if (llms.llmsTxt && llms.llmsTxt.found) {
    html += ci('pass', '<strong>/llms.txt</strong> found (' + llms.llmsTxt.length + ' chars)');
    html += '<div class="llms-preview">' + esc(llms.llmsTxt.content) + '</div>';
  } else {
    html += ci('fail', '<strong>/llms.txt</strong> not found');
  }
  if (llms.llmsFullTxt && llms.llmsFullTxt.found) {
    html += ci('pass', '<strong>/llms-full.txt</strong> found (' + llms.llmsFullTxt.length + ' chars)');
  } else {
    html += ci('warn', '<strong>/llms-full.txt</strong> not found (optional)');
  }
  body.innerHTML = html;
}

function renderDetailSchema(data) {
  const body = document.getElementById('detail-schema-body');
  const s = data.page.schema;
  let html = '';

  if (s.jsonLdCount > 0) html += ci('pass', `<strong>${s.jsonLdCount}</strong> JSON-LD blocks`);
  else html += ci('fail', 'No JSON-LD structured data');

  if (s.invalidBlocks > 0) html += ci('fail', `<strong>${s.invalidBlocks}</strong> invalid JSON-LD blocks`);
  if (s.hasSpeakable) html += ci('pass', '<strong>Speakable</strong> markup (voice/AI ready)');
  else html += ci('warn', 'No Speakable markup');

  ['FAQPage','HowTo','Article','Organization','Person','BreadcrumbList','Product','LocalBusiness'].forEach((t) => {
    const key = 'has' + t;
    if (s[key]) html += ci('pass', `<strong>${t}</strong> schema found`);
  });

  if (s.types.length > 0) {
    html += '<div class="tag-list">';
    s.types.forEach((t) => {
      const good = ['FAQPage','HowTo','Article','BlogPosting','Person','Organization'].includes(t);
      html += `<span class="tag ${good ? 'tag-good' : ''}">${esc(t)}</span>`;
    });
    html += '</div>';
  }

  if (s.validationIssues && s.validationIssues.length > 0) {
    html += '<div class="validation-list">';
    s.validationIssues.forEach((v) => html += `<div class="validation-item">${esc(v)}</div>`);
    html += '</div>';
  }

  body.innerHTML = html;
}

function renderDetailContent(data) {
  const body = document.getElementById('detail-content-body');
  const h = data.page.headings;
  const m = data.page.meta;
  let html = '';

  if (h.h1Count === 1) html += ci('pass', `Single H1: <strong>${esc(h.h1Text)}</strong>`);
  else if (h.h1Count === 0) html += ci('fail', 'No H1 tag');
  else html += ci('warn', `${h.h1Count} H1 tags (should be 1)`);

  html += ci(h.hierarchyClean ? 'pass' : 'warn', h.hierarchyClean ? 'Clean heading hierarchy' : 'Heading hierarchy has gaps');
  html += ci(h.h2Count >= 2 ? 'pass' : 'warn', `<strong>${h.h2Count}</strong> H2, <strong>${h.h3Count}</strong> H3`);
  html += ci(h.faqCount >= 2 ? 'pass' : 'warn', `<strong>${h.faqCount}</strong> question-style headings`);
  html += ci(h.listCount >= 2 ? 'pass' : 'warn', `<strong>${h.listCount}</strong> lists, <strong>${h.tableCount}</strong> tables`);

  if (m.description && m.descriptionLength >= 70 && m.descriptionLength <= 160) html += ci('pass', `Meta description: ${m.descriptionLength} chars`);
  else if (m.description) html += ci('warn', `Meta description: ${m.descriptionLength} chars`);
  else html += ci('fail', 'No meta description');

  body.innerHTML = html;
}

function renderDetailEntity(data) {
  const body = document.getElementById('detail-entity-body');
  const m = data.page.meta;
  const e = data.page.entity;
  let html = '';

  const og = [m.hasOgTitle, m.hasOgDescription, m.hasOgImage].filter(Boolean).length;
  html += ci(og === 3 ? 'pass' : og > 0 ? 'warn' : 'fail', `Open Graph: ${og}/3 tags`);
  html += ci(m.hasCanonical ? 'pass' : 'fail', m.hasCanonical ? 'Canonical URL set' : 'No canonical');
  html += ci(m.hasAuthor ? 'pass' : 'warn', m.hasAuthor ? `Author: <strong>${esc(m.author)}</strong>` : 'No author meta');
  html += ci(e.hasAboutLink ? 'pass' : 'warn', e.hasAboutLink ? 'About link found' : 'No About link');
  html += ci(e.hasContactLink ? 'pass' : 'warn', e.hasContactLink ? 'Contact link found' : 'No Contact link');
  html += ci(e.socialLinkCount >= 2 ? 'pass' : 'warn', `<strong>${e.socialLinkCount}</strong> social links`);
  html += ci(e.hasSameAs ? 'pass' : 'warn', e.hasSameAs ? `sameAs linking (${e.sameAsCount} URLs)` : 'No sameAs linking');

  body.innerHTML = html;
}

function renderDetailEEAT(data) {
  const body = document.getElementById('detail-eeat-body');
  const ee = data.page.eeat;
  const e = data.page.entity;
  let html = '';

  html += ci(ee.hasAuthorByline ? 'pass' : 'fail', ee.hasAuthorByline ? 'Author byline detected' : 'No author byline');
  html += ci(ee.hasAuthorBio ? 'pass' : 'warn', ee.hasAuthorBio ? 'Author bio found' : 'No author bio');
  html += ci(ee.hasVisibleDate ? 'pass' : 'warn', ee.hasVisibleDate ? 'Publication date visible' : 'No visible date');
  html += ci(ee.hasCredentials ? 'pass' : 'info', ee.hasCredentials ? 'Credentials mentioned' : 'No credentials detected');
  html += ci(ee.citedSources >= 3 ? 'pass' : ee.citedSources >= 1 ? 'warn' : 'fail', `<strong>${ee.citedSources}</strong> external citations`);
  html += ci(e.hasPrivacyLink ? 'pass' : 'warn', e.hasPrivacyLink ? 'Privacy policy link' : 'No privacy policy');
  html += ci(e.hasTermsLink ? 'pass' : 'info', e.hasTermsLink ? 'Terms of service link' : 'No terms link');
  html += ci(ee.hasEditorialPolicy ? 'pass' : 'info', ee.hasEditorialPolicy ? 'Editorial policy found' : 'No editorial policy');
  html += ci(ee.hasReviewedBy || ee.hasFactCheckClaim ? 'pass' : 'info', ee.hasReviewedBy || ee.hasFactCheckClaim ? 'Review/fact-check signals' : 'No review signals');

  body.innerHTML = html;
}

function renderDetailCiteability(data) {
  const body = document.getElementById('detail-citeability-body');
  const c = data.page.citeability;
  let html = '';

  html += ci(c.avgSentencesPerParagraph <= 3 ? 'pass' : 'warn', `Avg paragraph: <strong>${c.avgSentencesPerParagraph}</strong> sentences`);
  const ratio = c.totalParagraphs > 0 ? Math.round((c.shortParagraphs / c.totalParagraphs) * 100) : 0;
  html += ci(ratio >= 70 ? 'pass' : 'warn', `<strong>${ratio}%</strong> short paragraphs`);
  html += ci(c.definitionCount >= 3 ? 'pass' : 'warn', `<strong>${c.definitionCount}</strong> definitions`);
  html += ci(c.statCount >= 3 ? 'pass' : 'info', `<strong>${c.statCount}</strong> statistics`);
  html += ci(c.boldCount >= 3 ? 'pass' : 'info', `<strong>${c.boldCount}</strong> bold elements`);
  html += ci(c.hasSummary ? 'pass' : 'warn', c.hasSummary ? 'Summary/TL;DR found' : 'No summary section');
  html += ci(c.firstParaAnswers ? 'pass' : 'warn', c.firstParaAnswers ? 'First para answers directly' : 'First para lacks direct answer');
  html += ci(c.listItemCount >= 5 ? 'pass' : 'info', `<strong>${c.listItemCount}</strong> list items`);

  body.innerHTML = html;
}

function renderDetailTechnical(data) {
  const body = document.getElementById('detail-technical-body');
  const t = data.page.technical;
  const c = data.page.content;
  let html = '';

  html += ci(c.wordCount >= 300 ? 'pass' : 'warn', `Word count: <strong>${c.wordCount.toLocaleString()}</strong>`);
  html += ci(c.hasMainElement ? 'pass' : 'warn', c.hasMainElement ? '&lt;main&gt; element' : 'No &lt;main&gt;');
  html += ci(c.hasArticleElement ? 'pass' : 'info', c.hasArticleElement ? '&lt;article&gt; element' : 'No &lt;article&gt;');

  if (t.totalImages > 0) {
    html += ci(t.altTextRatio >= 90 ? 'pass' : 'warn', `Alt text: <strong>${t.altTextRatio}%</strong> (${t.imagesWithAlt}/${t.totalImages})`);
  }

  html += ci(t.internalLinks >= 5 ? 'pass' : 'warn', `<strong>${t.internalLinks}</strong> internal, <strong>${t.externalLinks}</strong> external links`);

  body.innerHTML = html;
}

function renderDetailPerformance(data) {
  const body = document.getElementById('detail-performance-body');
  const p = data.page.performance;
  let html = '';

  if (p.domContentLoaded !== null) {
    html += ci(p.domContentLoaded < 1500 ? 'pass' : 'warn', `DOM Content Loaded: <strong>${(p.domContentLoaded / 1000).toFixed(2)}s</strong>`);
  }
  if (p.pageLoaded !== null) {
    html += ci(p.pageLoaded < 3000 ? 'pass' : 'warn', `Page Loaded: <strong>${(p.pageLoaded / 1000).toFixed(2)}s</strong>`);
  }
  html += ci(p.domNodes < 1000 ? 'pass' : p.domNodes < 1500 ? 'warn' : 'fail', `DOM nodes: <strong>${p.domNodes.toLocaleString()}</strong>`);
  html += ci('info', `<strong>${p.resourceCount}</strong> resources loaded`);
  html += ci(p.renderBlockingCSS <= 2 ? 'pass' : 'warn', `<strong>${p.renderBlockingCSS}</strong> render-blocking CSS`);
  html += ci(p.renderBlockingJS <= 1 ? 'pass' : 'warn', `<strong>${p.renderBlockingJS}</strong> render-blocking JS`);

  body.innerHTML = html;
}

// ─── Helpers ─────────────────────────────────────────────────

function ci(type, text) {
  const icons = { pass: '&#10003;', fail: '&#10007;', warn: '&#9888;', info: '&#8505;' };
  return `<div class="check-item">
    <span class="check-icon check-${type}">${icons[type]}</span>
    <span class="check-text">${text}</span>
  </div>`;
}

function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
