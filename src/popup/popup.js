// AI Visibility Auditor v2 — Popup Logic
// Scoring engine, recommendations, export, full report

let auditDataGlobal = null;
let scoresGlobal = null;

document.addEventListener('DOMContentLoaded', () => {
  const retryBtn = document.getElementById('retry-btn');
  if (retryBtn) retryBtn.addEventListener('click', runAudit);
  runAudit();
});

async function runAudit() {
  showLoading();

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
      showError('Cannot audit browser internal pages. Navigate to a website first.');
      return;
    }

    const origin = new URL(tab.url).origin;

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content/content.js']
    });

    const pageData = await sendTabMessage(tab.id, { action: 'auditPage' });
    if (!pageData.success) {
      showError('Failed to audit page: ' + (pageData.error || 'Unknown error'));
      return;
    }

    const [robotsResult, llmsResult] = await Promise.all([
      sendRuntimeMessage({ action: 'fetchRobotsTxt', origin }),
      sendRuntimeMessage({ action: 'fetchLlmsTxt', origin })
    ]);

    const auditData = {
      page: pageData.data,
      robots: robotsResult.success ? robotsResult.data : null,
      llms: llmsResult.success ? llmsResult.data : null
    };

    const scores = calculateScores(auditData);
    const recommendations = generateRecommendations(auditData, scores);

    auditDataGlobal = auditData;
    scoresGlobal = scores;

    renderResults(auditData, scores, recommendations, tab.url);
    setupActionButtons(auditData, scores, recommendations, tab.url);

  } catch (err) {
    showError('Audit failed: ' + err.message);
  }
}

function sendTabMessage(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message });
      } else {
        resolve(response || { success: false, error: 'No response' });
      }
    });
  });
}

function sendRuntimeMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message });
      } else {
        resolve(response || { success: false, error: 'No response' });
      }
    });
  });
}

// ─── Scoring Engine (8 categories) ──────────────────────────

function calculateScores(data) {
  const { page, robots, llms } = data;
  const scores = {};

  // 1. Robots & Crawler Access (0-100)
  if (robots && robots.crawlers) {
    const aiCrawlers = robots.crawlers.filter(
      (c) => !['Googlebot', 'Bingbot'].includes(c.name)
    );
    const allowed = aiCrawlers.filter((c) => c.status === 'allowed' || c.status === 'no-robots').length;
    scores.robots = Math.round((allowed / aiCrawlers.length) * 100);
  } else {
    scores.robots = 50;
  }

  // 2. LLMs.txt (0-100)
  scores.llms = 0;
  if (llms) {
    if (llms.llmsTxt && llms.llmsTxt.found) scores.llms += 70;
    if (llms.llmsFullTxt && llms.llmsFullTxt.found) scores.llms += 30;
  }

  // 3. Schema (0-100)
  const schema = page.schema;
  let schemaScore = 0;
  if (schema.jsonLdCount > 0) schemaScore += 20;
  if (schema.jsonLdCount >= 3) schemaScore += 10;
  if (schema.hasArticle || schema.hasOrganization || schema.hasPerson) schemaScore += 15;
  if (schema.hasBreadcrumb) schemaScore += 10;
  if (schema.hasFAQPage) schemaScore += 10;
  if (schema.hasHowTo) schemaScore += 5;
  if (schema.hasSpeakable) schemaScore += 15;
  if (schema.hasMicrodata || schema.hasRDFa) schemaScore += 5;
  if (schema.hasLocalBusiness || schema.hasProduct) schemaScore += 5;
  // Penalize for validation issues
  if (schema.validationIssues && schema.validationIssues.length > 0) {
    schemaScore -= Math.min(15, schema.validationIssues.length * 5);
  }
  if (schema.invalidBlocks > 0) schemaScore -= 10;
  scores.schema = Math.max(0, Math.min(100, schemaScore));

  // 4. Content Structure (0-100)
  const headings = page.headings;
  const meta = page.meta;
  let contentScore = 0;
  if (headings.h1Count === 1) contentScore += 20;
  else if (headings.h1Count > 1) contentScore += 5;
  if (headings.hierarchyClean) contentScore += 15;
  if (headings.h2Count >= 2) contentScore += 10;
  if (headings.faqCount >= 2) contentScore += 15;
  else if (headings.faqCount === 1) contentScore += 8;
  if (headings.listCount >= 2) contentScore += 10;
  if (headings.tableCount >= 1) contentScore += 5;
  if (meta.description && meta.descriptionLength >= 70 && meta.descriptionLength <= 160) contentScore += 15;
  else if (meta.description) contentScore += 8;
  if (meta.titleLength >= 20 && meta.titleLength <= 70) contentScore += 10;
  else if (meta.title) contentScore += 5;
  scores.content = Math.min(100, contentScore);

  // 5. Entity & Authority (0-100)
  const entity = page.entity;
  let entityScore = 0;
  if (meta.hasOgTitle && meta.hasOgDescription) entityScore += 15;
  if (meta.hasOgImage) entityScore += 10;
  if (meta.hasCanonical) entityScore += 15;
  if (meta.hasAuthor) entityScore += 10;
  if (entity.hasAboutLink) entityScore += 10;
  if (entity.hasContactLink) entityScore += 10;
  if (entity.socialLinkCount >= 2) entityScore += 10;
  if (entity.hasSameAs) entityScore += 15;
  if (meta.lang) entityScore += 5;
  scores.entity = Math.min(100, entityScore);

  // 6. E-E-A-T Signals (0-100) — NEW
  const eeat = page.eeat;
  let eeatScore = 0;
  if (eeat.hasAuthorByline) eeatScore += 15;
  if (eeat.hasAuthorBio) eeatScore += 10;
  if (eeat.hasVisibleDate) eeatScore += 12;
  if (eeat.hasCredentials) eeatScore += 10;
  if (eeat.citedSources >= 3) eeatScore += 15;
  else if (eeat.citedSources >= 1) eeatScore += 8;
  if (entity.hasPrivacyLink) eeatScore += 8;
  if (entity.hasTermsLink) eeatScore += 5;
  if (eeat.hasEditorialPolicy) eeatScore += 8;
  if (eeat.hasFactCheckClaim || eeat.hasReviewedBy) eeatScore += 10;
  if (eeat.hasTrustBadges) eeatScore += 7;
  scores.eeat = Math.min(100, eeatScore);

  // 7. Content Citeability (0-100) — NEW
  const cite = page.citeability;
  let citeScore = 0;
  if (cite.totalParagraphs > 0) {
    const shortRatio = cite.shortParagraphs / cite.totalParagraphs;
    if (shortRatio >= 0.7) citeScore += 20;
    else if (shortRatio >= 0.4) citeScore += 10;
  }
  if (cite.avgSentencesPerParagraph > 0 && cite.avgSentencesPerParagraph <= 3) citeScore += 15;
  else if (cite.avgSentencesPerParagraph <= 4) citeScore += 8;
  if (cite.definitionCount >= 3) citeScore += 15;
  else if (cite.definitionCount >= 1) citeScore += 8;
  if (cite.statCount >= 3) citeScore += 10;
  else if (cite.statCount >= 1) citeScore += 5;
  if (cite.boldCount >= 3) citeScore += 8;
  if (cite.hasSummary) citeScore += 12;
  if (cite.firstParaAnswers) citeScore += 10;
  if (cite.listItemCount >= 5) citeScore += 10;
  else if (cite.listItemCount >= 2) citeScore += 5;
  scores.citeability = Math.min(100, citeScore);

  // 8. Technical (0-100)
  const tech = page.technical;
  const content = page.content;
  let techScore = 0;
  if (tech.altTextRatio >= 90) techScore += 20;
  else if (tech.altTextRatio >= 60) techScore += 10;
  if (content.wordCount >= 300) techScore += 20;
  else if (content.wordCount >= 100) techScore += 10;
  if (tech.internalLinks >= 5) techScore += 15;
  else if (tech.internalLinks >= 2) techScore += 8;
  if (content.hasMainElement) techScore += 15;
  if (content.hasArticleElement) techScore += 10;
  if (tech.externalLinks >= 1) techScore += 10;
  if (tech.hreflangCount >= 1) techScore += 10;
  scores.technical = Math.min(100, techScore);

  // 9. Performance (informational, not weighted)
  const perf = page.performance;
  let perfScore = 50; // base
  if (perf.domContentLoaded !== null) {
    if (perf.domContentLoaded < 1500) perfScore += 20;
    else if (perf.domContentLoaded < 3000) perfScore += 10;
    else perfScore -= 10;
  }
  if (perf.domNodes < 1000) perfScore += 15;
  else if (perf.domNodes < 1500) perfScore += 5;
  else perfScore -= 10;
  if (perf.renderBlockingCSS <= 2) perfScore += 10;
  if (perf.renderBlockingJS <= 1) perfScore += 5;
  scores.performance = Math.max(0, Math.min(100, perfScore));

  // Overall (weighted — performance is informational, not weighted)
  scores.overall = Math.round(
    scores.robots * 0.18 +
    scores.llms * 0.08 +
    scores.schema * 0.18 +
    scores.content * 0.15 +
    scores.entity * 0.10 +
    scores.eeat * 0.12 +
    scores.citeability * 0.10 +
    scores.technical * 0.09
  );

  return scores;
}

// ─── Recommendations Engine ──────────────────────────────────

function generateRecommendations(data, scores) {
  const fixes = [];
  const { page, robots, llms } = data;

  // LLMs.txt
  if (scores.llms === 0) {
    fixes.push({
      title: 'Add /llms.txt file to your site root',
      impact: '+8',
      effort: 'Quick',
      category: 'LLMs.txt',
      priority: 'high'
    });
  } else if (scores.llms < 100) {
    fixes.push({
      title: 'Add /llms-full.txt for comprehensive AI instructions',
      impact: '+3',
      effort: 'Quick',
      category: 'LLMs.txt',
      priority: 'medium'
    });
  }

  // Schema
  if (page.schema.jsonLdCount === 0) {
    fixes.push({
      title: 'Add JSON-LD structured data (Article, Organization, or Person)',
      impact: '+18',
      effort: 'Medium',
      category: 'Schema',
      priority: 'high'
    });
  }
  if (!page.schema.hasSpeakable && page.schema.jsonLdCount > 0) {
    fixes.push({
      title: 'Add Speakable markup for voice search and AI citations',
      impact: '+4',
      effort: 'Quick',
      category: 'Schema',
      priority: 'medium'
    });
  }
  if (page.schema.invalidBlocks > 0) {
    fixes.push({
      title: 'Fix invalid JSON-LD blocks (' + page.schema.invalidBlocks + ' errors)',
      impact: '+3',
      effort: 'Quick',
      category: 'Schema',
      priority: 'high'
    });
  }
  if (page.schema.validationIssues && page.schema.validationIssues.length > 0) {
    fixes.push({
      title: 'Complete missing schema properties (' + page.schema.validationIssues.length + ' issues)',
      impact: '+5',
      effort: 'Medium',
      category: 'Schema',
      priority: 'medium'
    });
  }

  // E-E-A-T
  if (!page.eeat.hasAuthorByline) {
    fixes.push({
      title: 'Add author byline with name and credentials',
      impact: '+5',
      effort: 'Quick',
      category: 'E-E-A-T',
      priority: 'high'
    });
  }
  if (!page.eeat.hasVisibleDate) {
    fixes.push({
      title: 'Add visible publication and last-updated dates',
      impact: '+4',
      effort: 'Quick',
      category: 'E-E-A-T',
      priority: 'medium'
    });
  }
  if (page.eeat.citedSources < 3) {
    fixes.push({
      title: 'Add external citations to authoritative sources (currently: ' + page.eeat.citedSources + ')',
      impact: '+4',
      effort: 'Medium',
      category: 'E-E-A-T',
      priority: 'medium'
    });
  }

  // Citeability
  if (!page.citeability.hasSummary) {
    fixes.push({
      title: 'Add a TL;DR or Key Takeaways section',
      impact: '+3',
      effort: 'Quick',
      category: 'Citeability',
      priority: 'medium'
    });
  }
  if (page.citeability.definitionCount === 0) {
    fixes.push({
      title: 'Add clear definitions ("X is..." statements) for key terms',
      impact: '+3',
      effort: 'Quick',
      category: 'Citeability',
      priority: 'medium'
    });
  }

  // Content
  if (page.headings.h1Count === 0) {
    fixes.push({
      title: 'Add an H1 heading to the page',
      impact: '+5',
      effort: 'Quick',
      category: 'Content',
      priority: 'high'
    });
  }
  if (!page.meta.description) {
    fixes.push({
      title: 'Add a meta description (70-160 characters)',
      impact: '+4',
      effort: 'Quick',
      category: 'Content',
      priority: 'high'
    });
  }
  if (page.headings.faqCount === 0) {
    fixes.push({
      title: 'Add question-style headings for AI Q&A citations',
      impact: '+4',
      effort: 'Medium',
      category: 'Content',
      priority: 'medium'
    });
  }

  // Entity
  if (!page.meta.hasCanonical) {
    fixes.push({
      title: 'Set a canonical URL to prevent duplicate content',
      impact: '+3',
      effort: 'Quick',
      category: 'Entity',
      priority: 'medium'
    });
  }
  if (!page.entity.hasSameAs) {
    fixes.push({
      title: 'Add sameAs entity linking in schema (social profiles, Wikipedia)',
      impact: '+3',
      effort: 'Medium',
      category: 'Entity',
      priority: 'low'
    });
  }

  // Robots
  if (robots && robots.crawlers) {
    const blocked = robots.crawlers.filter((c) => c.status === 'blocked' && c.type === 'search');
    if (blocked.length > 0) {
      fixes.push({
        title: 'Unblock AI search crawlers: ' + blocked.map((c) => c.name).join(', '),
        impact: '+6',
        effort: 'Quick',
        category: 'Robots',
        priority: 'high'
      });
    }
  }

  // Technical
  if (page.technical.altTextRatio < 60 && page.technical.totalImages > 0) {
    fixes.push({
      title: 'Add alt text to images (' + page.technical.imagesWithoutAlt + ' missing)',
      impact: '+3',
      effort: 'Medium',
      category: 'Technical',
      priority: 'medium'
    });
  }
  if (page.content.wordCount < 300) {
    fixes.push({
      title: 'Increase content depth (currently ' + page.content.wordCount + ' words, aim for 300+)',
      impact: '+4',
      effort: 'Hard',
      category: 'Technical',
      priority: 'medium'
    });
  }

  // Sort by impact (descending)
  fixes.sort((a, b) => parseInt(b.impact) - parseInt(a.impact));

  return fixes.slice(0, 7); // top 7
}

// ─── Rendering ───────────────────────────────────────────────

function renderResults(data, scores, recommendations, url) {
  document.getElementById('loading').classList.add('hidden');
  document.getElementById('error').classList.add('hidden');
  document.getElementById('results').classList.remove('hidden');

  document.getElementById('page-url').textContent = url;
  renderOverallScore(scores.overall);

  // Category scores
  const categories = ['robots', 'llms', 'schema', 'content', 'entity', 'eeat', 'citeability', 'technical', 'performance'];
  categories.forEach((cat) => renderCategoryScore(cat, scores[cat]));

  // Section bodies
  renderFixesBody(recommendations);
  renderRobotsBody(data.robots);
  renderLlmsBody(data.llms);
  renderSchemaBody(data.page.schema);
  renderContentBody(data.page.headings, data.page.meta);
  renderEntityBody(data.page.meta, data.page.entity);
  renderEEATBody(data.page.eeat, data.page.entity);
  renderCiteabilityBody(data.page.citeability);
  renderTechnicalBody(data.page.technical, data.page.content);
  renderPerformanceBody(data.page.performance);

  // Section toggles
  document.querySelectorAll('.section-header').forEach((btn) => {
    btn.addEventListener('click', () => {
      const section = btn.getAttribute('data-section');
      const body = document.getElementById('body-' + section);
      if (body) {
        body.classList.toggle('hidden');
        btn.classList.toggle('open');
      }
    });
  });

  document.getElementById('audit-time').textContent = new Date().toLocaleTimeString();
}

function setupActionButtons(data, scores, recommendations, url) {
  // Copy Report
  document.getElementById('btn-copy').addEventListener('click', () => {
    const md = generateMarkdownReport(data, scores, recommendations, url);
    navigator.clipboard.writeText(md).then(() => {
      const btn = document.getElementById('btn-copy');
      btn.classList.add('copied');
      btn.querySelector('svg').nextSibling.textContent = ' Copied!';
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.querySelector('svg').nextSibling.textContent = ' Copy';
      }, 2000);
    });
  });

  // Export JSON
  document.getElementById('btn-export').addEventListener('click', () => {
    const json = JSON.stringify({ url, timestamp: new Date().toISOString(), scores, data }, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = 'ai-audit-' + new URL(url).hostname + '.json';
    a.click();
    URL.revokeObjectURL(blobUrl);
  });

  // Full Report
  document.getElementById('btn-fullreport').addEventListener('click', () => {
    chrome.storage.local.set({
      auditReport: {
        url,
        timestamp: new Date().toISOString(),
        scores,
        data,
        recommendations
      }
    }, () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('report/report.html') });
    });
  });
}

function generateMarkdownReport(data, scores, recommendations, url) {
  const lines = [];
  lines.push('# AI Visibility Audit Report');
  lines.push('');
  lines.push('**URL:** ' + url);
  lines.push('**Date:** ' + new Date().toLocaleString());
  lines.push('**Overall Score:** ' + scores.overall + '/100');
  lines.push('');
  lines.push('## Category Scores');
  lines.push('');
  lines.push('| Category | Score |');
  lines.push('|----------|-------|');
  lines.push('| Robots & Crawler Access | ' + scores.robots + '/100 |');
  lines.push('| LLMs.txt | ' + scores.llms + '/100 |');
  lines.push('| Schema & Structured Data | ' + scores.schema + '/100 |');
  lines.push('| Content Structure | ' + scores.content + '/100 |');
  lines.push('| Entity & Authority | ' + scores.entity + '/100 |');
  lines.push('| E-E-A-T Signals | ' + scores.eeat + '/100 |');
  lines.push('| Content Citeability | ' + scores.citeability + '/100 |');
  lines.push('| Technical AI-Readiness | ' + scores.technical + '/100 |');
  lines.push('| Page Performance | ' + scores.performance + '/100 |');
  lines.push('');

  if (recommendations.length > 0) {
    lines.push('## Top Fixes');
    lines.push('');
    recommendations.forEach((fix, i) => {
      lines.push((i + 1) + '. **' + fix.title + '** (Impact: ' + fix.impact + ' pts, Effort: ' + fix.effort + ')');
    });
    lines.push('');
  }

  lines.push('---');
  lines.push('*Generated by AI Visibility Auditor v2*');
  return lines.join('\n');
}

function renderOverallScore(score) {
  const scoreCard = document.getElementById('score-card');
  const scoreFill = document.getElementById('score-fill');
  const scoreNumber = document.getElementById('score-number');
  const scoreLabel = document.getElementById('score-label');
  const scoreDetail = document.getElementById('score-detail');

  const circumference = 264;
  const offset = circumference - (score / 100) * circumference;

  let colorClass = 'score-red';
  let label = 'Not Optimized';
  let detail = 'Significant improvements needed for AI visibility.';

  if (score >= 80) {
    colorClass = 'score-green';
    label = 'AI-Ready';
    detail = 'Well optimized for AI systems and LLM crawlers.';
  } else if (score >= 50) {
    colorClass = 'score-yellow';
    label = 'Needs Work';
    detail = 'Some AI-friendly elements but key areas need improvement.';
  }

  scoreCard.className = 'score-card ' + colorClass;
  scoreNumber.textContent = score;
  scoreLabel.textContent = label;
  scoreDetail.textContent = detail;

  setTimeout(() => { scoreFill.style.strokeDashoffset = offset; }, 100);
}

function renderCategoryScore(category, score) {
  const icon = document.getElementById('icon-' + category);
  const scoreEl = document.getElementById('score-' + category);
  if (!icon || !scoreEl) return;

  scoreEl.textContent = score + '/100';

  if (score >= 80) {
    icon.style.color = '#22c55e';
    scoreEl.style.color = '#22c55e';
  } else if (score >= 50) {
    icon.style.color = '#eab308';
    scoreEl.style.color = '#eab308';
  } else {
    icon.style.color = '#ef4444';
    scoreEl.style.color = '#ef4444';
  }
}

// ─── Section Renderers ───────────────────────────────────────

function renderFixesBody(recommendations) {
  const body = document.getElementById('body-fixes');
  if (recommendations.length === 0) {
    body.innerHTML = checkItem('pass', 'No critical fixes needed. Great job!');
    return;
  }

  let html = '';
  recommendations.forEach((fix, i) => {
    html += `<div class="fix-item">
      <div class="fix-priority ${fix.priority}">${i + 1}</div>
      <div class="fix-content">
        <div class="fix-title">${esc(fix.title)}</div>
        <div class="fix-meta">
          <span class="fix-impact">+${esc(fix.impact)} pts</span>
          <span class="fix-effort">${esc(fix.effort)}</span>
          <span>${esc(fix.category)}</span>
        </div>
      </div>
    </div>`;
  });
  body.innerHTML = html;
}

function renderRobotsBody(robots) {
  const body = document.getElementById('body-robots');
  if (!robots) {
    body.innerHTML = checkItem('fail', 'Could not fetch robots.txt');
    return;
  }
  if (!robots.found) {
    body.innerHTML = checkItem('warn', 'No robots.txt found. All crawlers allowed by default.');
    return;
  }

  let html = '<table class="crawler-table"><tr><th>Crawler</th><th>Type</th><th>Status</th></tr>';
  robots.crawlers.forEach((c) => {
    const statusClass = 'status-' + c.status;
    const statusText = c.status === 'no-robots' ? 'Default' : c.status.charAt(0).toUpperCase() + c.status.slice(1);
    const typeClass = c.type === 'search' ? 'search' : 'training';
    html += `<tr>
      <td>${esc(c.name)} <span class="crawler-owner">${esc(c.owner)}</span></td>
      <td><span class="crawler-type ${typeClass}">${esc(c.type)}</span></td>
      <td class="${statusClass}">${statusText}</td>
    </tr>`;
  });
  html += '</table>';

  const allowed = robots.crawlers.filter((c) => c.status === 'allowed' || c.status === 'no-robots').length;
  const blocked = robots.crawlers.filter((c) => c.status === 'blocked').length;
  html += checkItem(
    blocked === 0 ? 'pass' : blocked <= 3 ? 'warn' : 'fail',
    `<strong>${allowed}</strong> allowed, <strong>${blocked}</strong> blocked`
  );

  if (robots.sitemaps && robots.sitemaps.length > 0) {
    html += checkItem('pass', `<strong>${robots.sitemaps.length}</strong> sitemap${robots.sitemaps.length > 1 ? 's' : ''} declared in robots.txt`);
  } else {
    html += checkItem('warn', 'No sitemap declared in robots.txt');
  }

  body.innerHTML = html;
}

function renderLlmsBody(llms) {
  const body = document.getElementById('body-llms');
  if (!llms) {
    body.innerHTML = checkItem('fail', 'Could not check for llms.txt');
    return;
  }

  let html = '';
  if (llms.llmsTxt && llms.llmsTxt.found) {
    html += checkItem('pass', '<strong>/llms.txt</strong> found (' + llms.llmsTxt.length + ' chars)');
    html += '<div class="llms-preview">' + esc(llms.llmsTxt.content) + '</div>';
  } else {
    html += checkItem('fail', '<strong>/llms.txt</strong> not found. AI systems cannot discover your site instructions.');
  }

  if (llms.llmsFullTxt && llms.llmsFullTxt.found) {
    html += checkItem('pass', '<strong>/llms-full.txt</strong> found (' + llms.llmsFullTxt.length + ' chars)');
  } else {
    html += checkItem('warn', '<strong>/llms-full.txt</strong> not found (optional but recommended)');
  }

  body.innerHTML = html;
}

function renderSchemaBody(schema) {
  const body = document.getElementById('body-schema');
  let html = '';

  if (schema.jsonLdCount > 0) {
    html += checkItem('pass', `<strong>${schema.jsonLdCount}</strong> JSON-LD block${schema.jsonLdCount > 1 ? 's' : ''} found`);
  } else {
    html += checkItem('fail', 'No JSON-LD structured data found');
  }

  if (schema.invalidBlocks > 0) {
    html += checkItem('fail', `<strong>${schema.invalidBlocks}</strong> invalid JSON-LD block${schema.invalidBlocks > 1 ? 's' : ''} (parse errors)`);
  }

  if (schema.hasSpeakable) html += checkItem('pass', '<strong>Speakable</strong> markup detected (voice/AI ready)');
  else html += checkItem('warn', 'No Speakable markup. Add for voice search and AI citations.');

  const schemaChecks = [
    [schema.hasFAQPage, 'FAQPage'], [schema.hasHowTo, 'HowTo'], [schema.hasArticle, 'Article'],
    [schema.hasOrganization, 'Organization'], [schema.hasPerson, 'Person'],
    [schema.hasBreadcrumb, 'BreadcrumbList'], [schema.hasProduct, 'Product'],
    [schema.hasLocalBusiness, 'LocalBusiness']
  ];
  schemaChecks.forEach(([has, name]) => {
    if (has) html += checkItem('pass', `<strong>${name}</strong> schema found`);
  });

  if (schema.types.length > 0) {
    html += '<div class="tag-list">';
    schema.types.forEach((t) => {
      const isGood = ['FAQPage', 'HowTo', 'Article', 'BlogPosting', 'Person', 'Organization'].includes(t);
      html += `<span class="tag ${isGood ? 'tag-good' : ''}">${esc(t)}</span>`;
    });
    html += '</div>';
  }

  // Validation issues
  if (schema.validationIssues && schema.validationIssues.length > 0) {
    html += '<div class="validation-list">';
    schema.validationIssues.forEach((issue) => {
      html += `<div class="validation-item">${esc(issue)}</div>`;
    });
    html += '</div>';
  }

  if (schema.hasMicrodata) html += checkItem('info', 'Microdata markup also detected');
  if (schema.hasRDFa) html += checkItem('info', 'RDFa markup also detected');

  body.innerHTML = html;
}

function renderContentBody(headings, meta) {
  const body = document.getElementById('body-content');
  let html = '';

  if (headings.h1Count === 1) {
    html += checkItem('pass', `Single H1: <strong>${esc(truncate(headings.h1Text, 55))}</strong>`);
  } else if (headings.h1Count === 0) {
    html += checkItem('fail', 'No H1 tag found');
  } else {
    html += checkItem('warn', `${headings.h1Count} H1 tags found (should be 1)`);
  }

  html += checkItem(headings.hierarchyClean ? 'pass' : 'warn',
    headings.hierarchyClean ? 'Heading hierarchy is clean' : 'Heading hierarchy has gaps');

  html += checkItem(headings.h2Count >= 2 ? 'pass' : headings.h2Count >= 1 ? 'warn' : 'fail',
    `<strong>${headings.h2Count}</strong> H2, <strong>${headings.h3Count}</strong> H3`);

  if (headings.faqCount >= 2) html += checkItem('pass', `<strong>${headings.faqCount}</strong> question-style headings (FAQ patterns)`);
  else if (headings.faqCount === 1) html += checkItem('warn', '1 question-style heading. Add more for AI citations.');
  else html += checkItem('warn', 'No question-style headings. AI systems prefer Q&A format.');

  html += checkItem(headings.listCount >= 2 ? 'pass' : 'warn',
    `<strong>${headings.listCount}</strong> lists, <strong>${headings.tableCount}</strong> tables`);

  if (meta.description && meta.descriptionLength >= 70 && meta.descriptionLength <= 160)
    html += checkItem('pass', `Meta description: ${meta.descriptionLength} chars (optimal)`);
  else if (meta.description)
    html += checkItem('warn', `Meta description: ${meta.descriptionLength} chars (aim for 70-160)`);
  else html += checkItem('fail', 'No meta description found');

  if (meta.titleLength >= 20 && meta.titleLength <= 70)
    html += checkItem('pass', `Title tag: ${meta.titleLength} chars (optimal)`);
  else if (meta.title) html += checkItem('warn', `Title tag: ${meta.titleLength} chars (aim for 20-70)`);
  else html += checkItem('fail', 'No title tag found');

  body.innerHTML = html;
}

function renderEntityBody(meta, entity) {
  const body = document.getElementById('body-entity');
  let html = '';

  const ogChecks = [meta.hasOgTitle, meta.hasOgDescription, meta.hasOgImage].filter(Boolean).length;
  if (ogChecks === 3) html += checkItem('pass', 'Open Graph tags complete (title, desc, image)');
  else if (ogChecks > 0) html += checkItem('warn', `Open Graph: ${ogChecks}/3 tags found`);
  else html += checkItem('fail', 'No Open Graph tags found');

  html += checkItem(meta.hasCanonical ? 'pass' : 'fail',
    meta.hasCanonical ? 'Canonical URL set' : 'No canonical URL found');

  html += checkItem(meta.hasAuthor ? 'pass' : 'warn',
    meta.hasAuthor ? `Author: <strong>${esc(meta.author)}</strong>` : 'No author meta tag');

  html += checkItem(entity.hasAboutLink ? 'pass' : 'warn',
    entity.hasAboutLink ? 'About page link found' : 'No About page link');
  html += checkItem(entity.hasContactLink ? 'pass' : 'warn',
    entity.hasContactLink ? 'Contact page link found' : 'No Contact page link');

  html += checkItem(entity.socialLinkCount >= 2 ? 'pass' : entity.socialLinkCount >= 1 ? 'warn' : 'fail',
    `<strong>${entity.socialLinkCount}</strong> social profile link${entity.socialLinkCount !== 1 ? 's' : ''}`);
  if (entity.socialPlatforms.length > 0) {
    html += '<div class="tag-list">';
    entity.socialPlatforms.forEach((p) => {
      html += `<span class="tag tag-good">${esc(p.replace('.com', '').replace('.net', '').replace('.app', ''))}</span>`;
    });
    html += '</div>';
  }

  html += checkItem(entity.hasSameAs ? 'pass' : 'warn',
    entity.hasSameAs ? `<strong>sameAs</strong> entity linking (${entity.sameAsCount} URLs)` : 'No sameAs entity linking in schema');

  html += checkItem(meta.lang ? 'pass' : 'warn',
    meta.lang ? `Language: <strong>${esc(meta.lang)}</strong>` : 'No lang attribute');

  body.innerHTML = html;
}

function renderEEATBody(eeat, entity) {
  const body = document.getElementById('body-eeat');
  let html = '';

  html += checkItem(eeat.hasAuthorByline ? 'pass' : 'fail',
    eeat.hasAuthorByline ? 'Author byline detected' : 'No author byline found on page');

  html += checkItem(eeat.hasAuthorBio ? 'pass' : 'warn',
    eeat.hasAuthorBio ? 'Author bio/credentials section found' : 'No author bio section detected');

  html += checkItem(eeat.hasVisibleDate ? 'pass' : 'warn',
    eeat.hasVisibleDate ? 'Publication/update date visible' : 'No visible date found');

  html += checkItem(eeat.hasCredentials ? 'pass' : 'info',
    eeat.hasCredentials ? 'Professional credentials mentioned in content' : 'No explicit credentials detected');

  html += checkItem(eeat.citedSources >= 3 ? 'pass' : eeat.citedSources >= 1 ? 'warn' : 'fail',
    `<strong>${eeat.citedSources}</strong> external source citation${eeat.citedSources !== 1 ? 's' : ''}`);

  html += checkItem(entity.hasPrivacyLink ? 'pass' : 'warn',
    entity.hasPrivacyLink ? 'Privacy policy link found' : 'No privacy policy link');
  html += checkItem(entity.hasTermsLink ? 'pass' : 'info',
    entity.hasTermsLink ? 'Terms of service link found' : 'No terms of service link');

  html += checkItem(eeat.hasEditorialPolicy ? 'pass' : 'info',
    eeat.hasEditorialPolicy ? 'Editorial policy/guidelines link found' : 'No editorial policy detected');

  html += checkItem(eeat.hasReviewedBy || eeat.hasFactCheckClaim ? 'pass' : 'info',
    eeat.hasReviewedBy || eeat.hasFactCheckClaim ? 'Content review/fact-check signals found' : 'No review/fact-check signals');

  html += checkItem(eeat.hasTrustBadges ? 'pass' : 'info',
    eeat.hasTrustBadges ? 'Trust/verification badges detected' : 'No trust badges detected');

  body.innerHTML = html;
}

function renderCiteabilityBody(cite) {
  const body = document.getElementById('body-citeability');
  let html = '';

  html += checkItem(cite.avgSentencesPerParagraph <= 3 ? 'pass' : cite.avgSentencesPerParagraph <= 4 ? 'warn' : 'fail',
    `Avg paragraph length: <strong>${cite.avgSentencesPerParagraph}</strong> sentences (shorter = more quotable)`);

  const shortRatio = cite.totalParagraphs > 0 ? Math.round((cite.shortParagraphs / cite.totalParagraphs) * 100) : 0;
  html += checkItem(shortRatio >= 70 ? 'pass' : shortRatio >= 40 ? 'warn' : 'fail',
    `<strong>${shortRatio}%</strong> short paragraphs (3 sentences or fewer)`);

  html += checkItem(cite.definitionCount >= 3 ? 'pass' : cite.definitionCount >= 1 ? 'warn' : 'fail',
    `<strong>${cite.definitionCount}</strong> definition pattern${cite.definitionCount !== 1 ? 's' : ''} ("X is..." statements)`);

  html += checkItem(cite.statCount >= 3 ? 'pass' : cite.statCount >= 1 ? 'warn' : 'info',
    `<strong>${cite.statCount}</strong> statistical claim${cite.statCount !== 1 ? 's' : ''} with numbers`);

  html += checkItem(cite.boldCount >= 3 ? 'pass' : cite.boldCount >= 1 ? 'warn' : 'info',
    `<strong>${cite.boldCount}</strong> bold/emphasis element${cite.boldCount !== 1 ? 's' : ''} highlighting key terms`);

  html += checkItem(cite.hasSummary ? 'pass' : 'warn',
    cite.hasSummary ? 'Summary/TL;DR section found' : 'No summary or key takeaways section');

  html += checkItem(cite.firstParaAnswers ? 'pass' : 'warn',
    cite.firstParaAnswers ? 'First paragraph provides direct answer' : 'First paragraph does not directly answer the topic');

  html += checkItem(cite.listItemCount >= 5 ? 'pass' : cite.listItemCount >= 2 ? 'warn' : 'info',
    `<strong>${cite.listItemCount}</strong> list items in content (structured, easy to cite)`);

  html += checkItem(cite.blockquoteCount >= 1 ? 'pass' : 'info',
    cite.blockquoteCount > 0 ? `<strong>${cite.blockquoteCount}</strong> blockquote${cite.blockquoteCount > 1 ? 's' : ''} (reference content)` : 'No blockquotes');

  body.innerHTML = html;
}

function renderTechnicalBody(tech, content) {
  const body = document.getElementById('body-technical');
  let html = '';

  if (content.wordCount >= 300)
    html += checkItem('pass', `Word count: <strong>${content.wordCount.toLocaleString()}</strong>`);
  else if (content.wordCount >= 100)
    html += checkItem('warn', `Word count: <strong>${content.wordCount.toLocaleString()}</strong> (aim for 300+)`);
  else
    html += checkItem('fail', `Word count: <strong>${content.wordCount.toLocaleString()}</strong> (very thin)`);

  html += checkItem(content.hasMainElement ? 'pass' : 'warn',
    content.hasMainElement ? '&lt;main&gt; element found' : 'No &lt;main&gt; element');
  html += checkItem(content.hasArticleElement ? 'pass' : 'info',
    content.hasArticleElement ? '&lt;article&gt; element found' : 'No &lt;article&gt; element');

  if (tech.totalImages === 0) {
    html += checkItem('info', 'No images on page');
  } else {
    html += checkItem(tech.altTextRatio >= 90 ? 'pass' : tech.altTextRatio >= 60 ? 'warn' : 'fail',
      `Alt text: <strong>${tech.altTextRatio}%</strong> (${tech.imagesWithAlt}/${tech.totalImages} images)`);
  }

  html += checkItem(tech.internalLinks >= 5 ? 'pass' : tech.internalLinks >= 2 ? 'warn' : 'fail',
    `<strong>${tech.internalLinks}</strong> internal, <strong>${tech.externalLinks}</strong> external links`);

  if (tech.hreflangCount > 0)
    html += checkItem('pass', `${tech.hreflangCount} hreflang tag${tech.hreflangCount > 1 ? 's' : ''}`);

  if (tech.hasJSFramework)
    html += checkItem('warn', 'JS framework detected. Ensure SSR for AI crawlers.');

  body.innerHTML = html;
}

function renderPerformanceBody(perf) {
  const body = document.getElementById('body-performance');
  let html = '';

  if (perf.domContentLoaded !== null) {
    html += checkItem(perf.domContentLoaded < 1500 ? 'pass' : perf.domContentLoaded < 3000 ? 'warn' : 'fail',
      `DOM Content Loaded: <strong>${(perf.domContentLoaded / 1000).toFixed(2)}s</strong>`);
  }

  if (perf.pageLoaded !== null) {
    html += checkItem(perf.pageLoaded < 3000 ? 'pass' : perf.pageLoaded < 5000 ? 'warn' : 'fail',
      `Page Loaded: <strong>${(perf.pageLoaded / 1000).toFixed(2)}s</strong>`);
  }

  html += checkItem(perf.domNodes < 1000 ? 'pass' : perf.domNodes < 1500 ? 'warn' : 'fail',
    `DOM nodes: <strong>${perf.domNodes.toLocaleString()}</strong> ${perf.domNodes > 1500 ? '(heavy for AI parsers)' : ''}`);

  html += checkItem('info', `<strong>${perf.resourceCount}</strong> resources loaded`);

  html += checkItem(perf.renderBlockingCSS <= 2 ? 'pass' : 'warn',
    `<strong>${perf.renderBlockingCSS}</strong> render-blocking CSS`);
  html += checkItem(perf.renderBlockingJS <= 1 ? 'pass' : 'warn',
    `<strong>${perf.renderBlockingJS}</strong> render-blocking JS in head`);

  body.innerHTML = html;
}

// ─── Helpers ─────────────────────────────────────────────────

function checkItem(type, text) {
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

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.substring(0, max) + '...' : str;
}

function showLoading() {
  document.getElementById('loading').classList.remove('hidden');
  document.getElementById('error').classList.add('hidden');
  document.getElementById('results').classList.add('hidden');
}

function showError(message) {
  document.getElementById('loading').classList.add('hidden');
  document.getElementById('error').classList.remove('hidden');
  document.getElementById('results').classList.add('hidden');
  document.getElementById('error-message').textContent = message;
}
