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

    // Fetch sitemap and feeds (sitemap needs robots sitemaps list)
    const robotsSitemaps = (robotsResult.success && robotsResult.data && robotsResult.data.sitemaps) ? robotsResult.data.sitemaps : [];
    const [sitemapResult, feedsResult] = await Promise.all([
      sendRuntimeMessage({ action: 'fetchSitemap', origin, robotsSitemaps }),
      sendRuntimeMessage({ action: 'fetchFeeds', origin })
    ]);

    const auditData = {
      page: pageData.data,
      robots: robotsResult.success ? robotsResult.data : null,
      llms: llmsResult.success ? llmsResult.data : null,
      sitemap: sitemapResult.success ? sitemapResult.data : null,
      feeds: feedsResult.success ? feedsResult.data : null
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

// ─── Scoring Engine (11 categories) ─────────────────────────

function calculateScores(data) {
  const { page, robots, llms, sitemap, feeds } = data;
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

  // 2b. Sitemap (0-100)
  let sitemapScore = 0;
  if (sitemap) {
    if (sitemap.found) sitemapScore += 30;
    if (sitemap.format === 'xml' || sitemap.format === 'index') sitemapScore += 20;
    if (sitemap.freshDays !== null && sitemap.freshDays < 30) sitemapScore += 20;
    if (sitemap.urlCount > 10) sitemapScore += 15;
    if (sitemap.inRobotsTxt) sitemapScore += 15;
  }
  scores.sitemap = Math.min(100, sitemapScore);

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

  // 9. Readability (0-100)
  const readability = page.readability;
  let readScore = 0;
  if (readability) {
    // ARI: 8-10 ideal
    if (readability.ari >= 8 && readability.ari <= 10) readScore += 40;
    else if ((readability.ari >= 6 && readability.ari < 8) || (readability.ari > 10 && readability.ari <= 12)) readScore += 25;
    else readScore += 10;
    // Passive voice
    if (readability.passiveVoicePercent < 10) readScore += 30;
    else if (readability.passiveVoicePercent <= 20) readScore += 20;
    else readScore += 10;
    // Average sentence length
    if (readability.avgSentenceLength >= 15 && readability.avgSentenceLength <= 20) readScore += 30;
    else if (readability.avgSentenceLength >= 10 && readability.avgSentenceLength <= 25) readScore += 20;
    else readScore += 10;
  }
  scores.readability = Math.min(100, readScore);

  // 10. Promotional Tone (0-100) — directly from content.js
  scores.promotional = (page.promotional && typeof page.promotional.score === 'number') ? page.promotional.score : 100;

  // 11. Performance (informational, not weighted)
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

  // Content Freshness (0-100)
  let freshnessScore = 0;
  if (meta.freshnessDays !== null) {
    if (meta.freshnessDays <= 30) freshnessScore = 100;
    else if (meta.freshnessDays <= 90) freshnessScore = 70;
    else if (meta.freshnessDays <= 180) freshnessScore = 40;
    else if (meta.freshnessDays <= 365) freshnessScore = 20;
    else freshnessScore = 5;
  } else {
    freshnessScore = 10; // no date at all = bad
  }
  scores.freshness = freshnessScore;

  // Citation Position (0-100)
  let positionScore = 0;
  if (page.citationPosition) {
    const cp = page.citationPosition;
    if (cp.zone1HasDirectAnswer) positionScore += 30;
    if (cp.zone1DefinitionCount >= 2) positionScore += 25;
    else if (cp.zone1DefinitionCount >= 1) positionScore += 15;
    if (cp.zone1StatCount >= 2) positionScore += 25;
    else if (cp.zone1StatCount >= 1) positionScore += 15;
    if (cp.zone1AttributionCount >= 1) positionScore += 20;
  }
  scores.position = Math.min(100, positionScore);

  // Source Authority (0-100)
  let authorityScore = 0;
  if (page.sourceAuthority) {
    const sa = page.sourceAuthority;
    if (sa.highCount >= 3) authorityScore += 50;
    else if (sa.highCount >= 1) authorityScore += 30;
    if (sa.mediumCount >= 3) authorityScore += 30;
    else if (sa.mediumCount >= 1) authorityScore += 20;
    if (sa.highCount === 0 && sa.mediumCount === 0 && sa.lowCount > 0) authorityScore = 30;
    if (sa.totalExternal === 0) authorityScore = 0;
  }
  scores.authority = Math.min(100, authorityScore);

  // Overall (weighted — performance is info-only)
  // Weights sum to 0.94, normalize to 0-100 scale
  const weightedSum =
    scores.robots * 0.12 +
    scores.llms * 0.02 +
    scores.sitemap * 0.03 +
    scores.schema * 0.10 +
    scores.content * 0.12 +
    scores.readability * 0.08 +
    scores.entity * 0.06 +
    scores.eeat * 0.06 +
    scores.citeability * 0.15 +
    scores.promotional * 0.08 +
    scores.authority * 0.02 +
    scores.position * 0.03 +
    scores.freshness * 0.03 +
    scores.technical * 0.04;
  scores.overall = Math.min(100, Math.round(weightedSum / 0.94));

  return scores;
}

// ─── Recommendations Engine ──────────────────────────────────

function generateRecommendations(data, scores) {
  const fixes = [];
  const { page, robots, llms, sitemap } = data;

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

  // LLMs.txt format issues
  if (llms && llms.llmsTxt && llms.llmsTxt.found) {
    if (!llms.llmsTxt.startsWithHeading) {
      fixes.push({ title: 'llms.txt should start with "# " heading', impact: '+2', effort: 'Quick', category: 'LLMs.txt', priority: 'medium' });
    }
    if (!llms.llmsTxt.hasSections) {
      fixes.push({ title: 'Add "## " section headings to llms.txt', impact: '+2', effort: 'Quick', category: 'LLMs.txt', priority: 'medium' });
    }
    if (!llms.llmsTxt.hasMarkdownLinks) {
      fixes.push({ title: 'Add markdown links (- [Title](url)) to llms.txt', impact: '+2', effort: 'Quick', category: 'LLMs.txt', priority: 'medium' });
    }
  }

  // Sitemap
  if (!sitemap || !sitemap.found) {
    fixes.push({ title: 'Add a sitemap.xml to help AI crawlers discover your pages', impact: '+5', effort: 'Medium', category: 'Sitemap', priority: 'high' });
  } else {
    if (sitemap.freshDays !== null && sitemap.freshDays > 30) {
      fixes.push({ title: 'Sitemap lastmod is ' + sitemap.freshDays + ' days old. Update it regularly.', impact: '+2', effort: 'Quick', category: 'Sitemap', priority: 'medium' });
    }
    if (!sitemap.inRobotsTxt) {
      fixes.push({ title: 'Declare your sitemap in robots.txt', impact: '+2', effort: 'Quick', category: 'Sitemap', priority: 'medium' });
    }
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

  // Readability
  if (page.readability) {
    if (page.readability.ari > 12) {
      fixes.push({ title: 'Readability too complex (ARI ' + page.readability.ari + '). Simplify sentences for AI parsing.', impact: '+3', effort: 'Medium', category: 'Readability', priority: 'medium' });
    } else if (page.readability.ari < 6 && page.content.wordCount > 200) {
      fixes.push({ title: 'Readability very basic (ARI ' + page.readability.ari + '). Add more depth for authoritative content.', impact: '+2', effort: 'Medium', category: 'Readability', priority: 'low' });
    }
    if (page.readability.passiveVoicePercent > 20) {
      fixes.push({ title: 'High passive voice (' + page.readability.passiveVoicePercent + '%). Use active voice for clarity.', impact: '+2', effort: 'Medium', category: 'Readability', priority: 'medium' });
    }
  }

  // Promotional tone
  if (page.promotional && page.promotional.score < 50) {
    fixes.push({ title: 'Content reads as promotional (score: ' + page.promotional.score + '/100). Reduce brand-centric language and CTAs.', impact: '+5', effort: 'Hard', category: 'Promotional', priority: 'high' });
  } else if (page.promotional && page.promotional.score < 80) {
    fixes.push({ title: 'Mixed promotional tone (score: ' + page.promotional.score + '/100). Reduce unsupported superlatives.', impact: '+3', effort: 'Medium', category: 'Promotional', priority: 'medium' });
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

  // Content Freshness
  if (scores.freshness < 40) {
    fixes.push({ title: 'Content is stale (' + (page.meta.freshnessDays || 'no date') + ' days). Update dateModified.', impact: '+3', effort: 'Quick', category: 'Freshness', priority: 'medium' });
  }

  // Citation Position
  if (page.citationPosition && !page.citationPosition.zone1HasDirectAnswer) {
    fixes.push({ title: 'Move your key answer to the first paragraph. 44% of AI citations come from top 30%.', impact: '+3', effort: 'Medium', category: 'Position', priority: 'high' });
  }

  // Source Authority
  if (page.sourceAuthority && page.sourceAuthority.highCount === 0 && page.sourceAuthority.mediumCount === 0) {
    fixes.push({ title: 'Add citations to authoritative sources (.gov, .edu, research). +115% visibility impact.', impact: '+4', effort: 'Medium', category: 'Authority', priority: 'high' });
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

  // Category scores (for section headers)
  const categories = ['robots', 'llms', 'sitemap', 'schema', 'content', 'readability', 'entity', 'eeat', 'citeability', 'promotional', 'technical', 'performance', 'freshness', 'position', 'authority'];
  categories.forEach((cat) => renderCategoryScore(cat, scores[cat]));

  // Overview score grid
  renderScoreGrid(scores);

  // Page info pills
  renderPageInfo(data, scores);

  // Get origin for clickable links
  const origin = new URL(url).origin;

  // Section bodies
  renderFixesBody(recommendations);
  renderRobotsBody(data.robots, origin);
  renderLlmsBody(data.llms, origin);
  renderSitemapBody(data.sitemap, origin);
  renderSchemaBody(data.page.schema);
  renderContentBody(data.page.headings, data.page.meta);
  renderReadabilityBody(data.page.readability);
  renderEntityBody(data.page.meta, data.page.entity);
  renderEEATBody(data.page.eeat, data.page.entity);
  renderCiteabilityBody(data.page.citeability);
  renderPromotionalBody(data.page.promotional);
  renderTechnicalBody(data.page.technical, data.page.content);
  renderPerformanceBody(data.page.performance);
  renderFreshnessBody(data.page.meta);
  renderPositionBody(data.page.citationPosition);
  renderAuthorityBody(data.page.sourceAuthority);

  // Tab switching
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
      tab.classList.add('active');
      const target = document.getElementById('tab-' + tab.getAttribute('data-tab'));
      if (target) target.classList.add('active');
    });
  });

  // Mark fixes tab if there are issues
  if (recommendations.length > 0) {
    const fixesTab = document.querySelector('.tab[data-tab="fixes"]');
    if (fixesTab) fixesTab.textContent = 'Fixes (' + recommendations.length + ')';
  }

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

  // Init sub-tabs inside sections
  initSubTabs();
}

function renderScoreGrid(scores) {
  const grid = document.getElementById('score-grid');
  const cats = [
    { key: 'robots', label: 'Crawlers' },
    { key: 'llms', label: 'LLMs.txt' },
    { key: 'sitemap', label: 'Sitemap' },
    { key: 'schema', label: 'Schema' },
    { key: 'content', label: 'Structure' },
    { key: 'readability', label: 'Readability' },
    { key: 'entity', label: 'Entity' },
    { key: 'eeat', label: 'E-E-A-T' },
    { key: 'citeability', label: 'Citeability' },
    { key: 'promotional', label: 'Promo Tone' },
    { key: 'authority', label: 'Source Auth' },
    { key: 'position', label: 'Citation Pos' },
    { key: 'freshness', label: 'Freshness' },
    { key: 'technical', label: 'Technical' },
    { key: 'performance', label: 'Performance' }
  ];

  grid.innerHTML = cats.map((cat) => {
    const s = scores[cat.key] || 0;
    const tier = s >= 80 ? 'good' : s >= 50 ? 'warn' : 'fail';
    const color = s >= 80 ? '#22c55e' : s >= 50 ? '#eab308' : '#ef4444';
    return '<div class="mini-card ' + tier + '">' +
      '<div class="mini-card-label">' + cat.label + '</div>' +
      '<div class="mini-card-value">' + s + '</div>' +
      '<div class="mini-card-bar"><div class="mini-card-fill" style="width:' + s + '%;background:' + color + '"></div></div>' +
      '</div>';
  }).join('');
}

function renderPageInfo(data, scores) {
  const info = document.getElementById('page-info');
  const pills = [];
  const page = data.page;

  // Page type
  if (page.pageType) {
    const t = page.pageType.type || 'general';
    const cls = t === 'blog' ? 'type-blog' : t === 'product' ? 'type-product' : t === 'homepage' ? 'type-homepage' : '';
    pills.push('<span class="info-pill ' + cls + '"><strong>' + t.charAt(0).toUpperCase() + t.slice(1) + '</strong></span>');
    if (page.pageType.isYMYL) {
      pills.push('<span class="info-pill type-ymyl"><strong>YMYL</strong> Extra scrutiny</span>');
    }
  }

  // Word count
  if (page.content && page.content.wordCount) {
    pills.push('<span class="info-pill"><strong>' + page.content.wordCount.toLocaleString() + '</strong> words</span>');
  }

  // Schema types count
  if (page.schema && page.schema.types) {
    pills.push('<span class="info-pill"><strong>' + page.schema.types.length + '</strong> schema types</span>');
  }

  // Readability
  if (page.readability && page.readability.ari) {
    pills.push('<span class="info-pill">ARI <strong>' + page.readability.ari + '</strong></span>');
  }

  // Promotional score
  if (page.promotional && page.promotional.score !== undefined) {
    const label = page.promotional.score >= 80 ? 'Non-promo' : page.promotional.score >= 50 ? 'Mixed' : 'Promotional';
    pills.push('<span class="info-pill">' + label + ' <strong>' + page.promotional.score + '</strong></span>');
  }

  info.innerHTML = pills.join('');
}

function setupActionButtons(data, scores, recommendations, url) {
  // Rescan
  const rescanBtn = document.getElementById('btn-rescan');
  if (rescanBtn) rescanBtn.addEventListener('click', runAudit);

  // Copy Report
  document.getElementById('btn-copy').addEventListener('click', () => {
    const md = generateMarkdownReport(data, scores, recommendations, url);
    navigator.clipboard.writeText(md).then(() => {
      const btn = document.getElementById('btn-copy');
      btn.classList.add('copied');
      btn.textContent = '\u2713';
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.textContent = '\uD83D\uDCCB';
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
  lines.push('| Sitemap & Indexing | ' + scores.sitemap + '/100 |');
  lines.push('| Schema & Structured Data | ' + scores.schema + '/100 |');
  lines.push('| Content Structure | ' + scores.content + '/100 |');
  lines.push('| Content Readability | ' + scores.readability + '/100 |');
  lines.push('| Entity & Authority | ' + scores.entity + '/100 |');
  lines.push('| E-E-A-T Signals | ' + scores.eeat + '/100 |');
  lines.push('| Content Citeability | ' + scores.citeability + '/100 |');
  lines.push('| Promotional Tone | ' + scores.promotional + '/100 |');
  lines.push('| Source Authority | ' + scores.authority + '/100 |');
  lines.push('| Citation Position | ' + scores.position + '/100 |');
  lines.push('| Content Freshness | ' + scores.freshness + '/100 |');
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
  lines.push('');
  lines.push('**Generated by [AI Visibility Auditor v2.1](https://sunilpratapsingh.com/audit?utm_source=ai-auditor&utm_medium=markdown&utm_campaign=v2.1)**');
  lines.push('Built on the Search Signal Framework by [Sunil Pratap Singh](https://sunilpratapsingh.com?utm_source=ai-auditor&utm_medium=markdown&utm_campaign=v2.1)');
  lines.push('');
  lines.push('> This audit checks if AI *can* see you. Want to know if AI *does* mention you?');
  lines.push('> [Get a professional AI visibility audit](https://sunilpratapsingh.com/consultant/geo?utm_source=ai-auditor&utm_medium=markdown-cta&utm_campaign=v2.1)');
  return lines.join('\n');
}

function renderOverallScore(score) {
  const scoreBar = document.getElementById('score-bar');
  const scoreFill = document.getElementById('score-fill');
  const scoreNumber = document.getElementById('score-number');
  const scoreLabel = document.getElementById('score-label');

  const circumference = 264;
  const offset = circumference - (score / 100) * circumference;

  let colorClass = 'score-red';
  let label = 'Not Optimized';

  if (score >= 80) {
    colorClass = 'score-green';
    label = score + '/100 — AI-Ready';
  } else if (score >= 50) {
    colorClass = 'score-yellow';
    label = score + '/100 — Needs Work';
  } else {
    label = score + '/100 — Not Optimized';
  }

  scoreBar.className = 'score-bar ' + colorClass;
  scoreNumber.textContent = score;
  scoreLabel.textContent = label;

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

function renderRobotsBody(robots, origin) {
  const body = document.getElementById('body-robots');
  if (!robots) {
    body.innerHTML = checkItem('fail', 'Could not fetch robots.txt');
    return;
  }
  if (!robots.found) {
    body.innerHTML = checkItem('warn', 'No robots.txt found. All crawlers allowed by default.') +
      fileLink(origin + '/robots.txt', 'View robots.txt');
    return;
  }

  let html = fileLink(origin + '/robots.txt', 'View robots.txt');
  html += '<table class="crawler-table"><tr><th>Crawler</th><th>Type</th><th>Status</th></tr>';
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

function renderLlmsBody(llms, origin) {
  const body = document.getElementById('body-llms');
  if (!llms) {
    body.innerHTML = checkItem('fail', 'Could not check for llms.txt');
    return;
  }

  let html = '';
  html += '<div class="file-links">';
  if (llms.llmsTxt && llms.llmsTxt.found) html += fileLink(origin + '/llms.txt', 'llms.txt');
  if (llms.llmsFullTxt && llms.llmsFullTxt.found) html += fileLink(origin + '/llms-full.txt', 'llms-full.txt');
  html += '</div>';

  if (llms.llmsTxt && llms.llmsTxt.found) {
    html += checkItem('pass', '<strong>/llms.txt</strong> found (' + llms.llmsTxt.length + ' chars)');
    html += checkItem(llms.llmsTxt.startsWithHeading ? 'pass' : 'warn',
      llms.llmsTxt.startsWithHeading ? 'Starts with # heading' : 'Should start with "# " heading');
    html += checkItem(llms.llmsTxt.hasSections ? 'pass' : 'warn',
      llms.llmsTxt.hasSections ? llms.llmsTxt.sectionCount + ' sections (## headings)' : 'No ## section headings found');
    html += checkItem(llms.llmsTxt.hasMarkdownLinks ? 'pass' : 'warn',
      llms.llmsTxt.hasMarkdownLinks ? llms.llmsTxt.linkCount + ' markdown links' : 'No markdown links found');
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

function renderSitemapBody(sitemap, origin) {
  const body = document.getElementById('body-sitemap');
  if (!sitemap) {
    body.innerHTML = checkItem('fail', 'Could not check sitemap');
    return;
  }

  let html = '';
  if (sitemap.found && sitemap.sources && sitemap.sources.length > 0) {
    html += '<div class="file-links">';
    sitemap.sources.forEach((s) => { html += fileLink(s, s.split('/').pop()); });
    html += '</div>';
  }

  if (sitemap.found) {
    html += checkItem('pass', '<strong>Sitemap found</strong> (' + esc(sitemap.format || 'unknown') + ' format)');
    if (sitemap.urlCount > 0) {
      html += checkItem(sitemap.urlCount > 10 ? 'pass' : 'warn',
        '<strong>' + sitemap.urlCount + '</strong> URLs in sitemap');
    }
    if (sitemap.lastmod) {
      html += checkItem(sitemap.freshDays < 30 ? 'pass' : 'warn',
        'Last modified: <strong>' + esc(sitemap.lastmod) + '</strong> (' + sitemap.freshDays + ' days ago)');
    } else {
      html += checkItem('warn', 'No lastmod dates in sitemap');
    }
    html += checkItem(sitemap.inRobotsTxt ? 'pass' : 'warn',
      sitemap.inRobotsTxt ? 'Sitemap declared in robots.txt' : 'Sitemap not declared in robots.txt');
    // Sources already shown as file-links above
  } else {
    html += checkItem('fail', 'No sitemap found');
  }

  body.innerHTML = html;
}

function renderReadabilityBody(readability) {
  const body = document.getElementById('body-readability');
  if (!readability) {
    body.innerHTML = checkItem('info', 'Readability data not available');
    return;
  }

  let html = '';

  // ARI score
  const ariLevel = readability.ari >= 8 && readability.ari <= 10 ? 'pass' : (readability.ari >= 6 && readability.ari <= 12 ? 'warn' : 'fail');
  html += checkItem(ariLevel,
    'ARI readability: <strong>' + readability.ari + '</strong> (' + esc(readability.gradeLevel) + ') — ideal is 8-10');

  // Average sentence length
  const sentLevel = readability.avgSentenceLength >= 15 && readability.avgSentenceLength <= 20 ? 'pass' : (readability.avgSentenceLength >= 10 && readability.avgSentenceLength <= 25 ? 'warn' : 'fail');
  html += checkItem(sentLevel,
    'Avg sentence length: <strong>' + readability.avgSentenceLength + '</strong> words — ideal is 15-20');

  // Passive voice
  const passLevel = readability.passiveVoicePercent < 10 ? 'pass' : (readability.passiveVoicePercent <= 20 ? 'warn' : 'fail');
  html += checkItem(passLevel,
    'Passive voice: <strong>' + readability.passiveVoicePercent + '%</strong> of sentences (' + readability.passiveCount + ' instances)');

  html += checkItem('info', '<strong>' + readability.sentenceCount + '</strong> sentences analyzed');

  body.innerHTML = html;
}

function renderPromotionalBody(promotional) {
  const body = document.getElementById('body-promotional');
  if (!promotional) {
    body.innerHTML = checkItem('info', 'Promotional tone data not available');
    return;
  }

  let html = '';

  // Overall score
  const level = promotional.score >= 80 ? 'pass' : (promotional.score >= 50 ? 'warn' : 'fail');
  const label = promotional.score >= 80 ? 'Non-promotional' : (promotional.score >= 50 ? 'Mixed tone' : 'Promotional');
  html += checkItem(level, 'Tone score: <strong>' + promotional.score + '/100</strong> (' + label + ')');

  // Brand-centric ratio
  html += checkItem(promotional.brandRatio <= 5 ? 'pass' : promotional.brandRatio <= 15 ? 'warn' : 'fail',
    'Brand-centric phrases: <strong>' + promotional.brandCount + '</strong> (' + promotional.brandRatio + '% of sentences)');

  // Unsupported superlatives
  html += checkItem(promotional.unsupportedSuperlatives === 0 ? 'pass' : promotional.unsupportedSuperlatives <= 3 ? 'warn' : 'fail',
    'Unsupported superlatives: <strong>' + promotional.unsupportedSuperlatives + '</strong>');

  // CTA density
  html += checkItem(promotional.ctaDensity < 2 ? 'pass' : promotional.ctaDensity < 4 ? 'warn' : 'fail',
    'CTA density: <strong>' + promotional.ctaDensity + '</strong> per 1000 words (' + promotional.ctaCount + ' total)');

  // Benefit-fact ratio
  html += checkItem(promotional.benefitFactRatio <= 0.3 ? 'pass' : promotional.benefitFactRatio <= 0.6 ? 'warn' : 'fail',
    'Benefit-to-fact ratio: <strong>' + promotional.benefitFactRatio + '</strong>');

  // Comparative self-promotion
  html += checkItem(promotional.comparativeCount === 0 ? 'pass' : promotional.comparativeCount <= 2 ? 'warn' : 'fail',
    'Comparative self-promo: <strong>' + promotional.comparativeCount + '</strong> phrases');

  body.innerHTML = html;
}

function renderSchemaBody(schema) {
  const body = document.getElementById('body-schema');

  // Sub-tab: Types
  let types = '';
  if (schema.jsonLdCount > 0) {
    types += checkItem('pass', `<strong>${schema.jsonLdCount}</strong> JSON-LD block${schema.jsonLdCount > 1 ? 's' : ''}`);
  } else {
    types += checkItem('fail', 'No JSON-LD structured data found');
  }
  if (schema.invalidBlocks > 0) types += checkItem('fail', `<strong>${schema.invalidBlocks}</strong> invalid blocks`);
  const schemaChecks = [
    [schema.hasFAQPage, 'FAQPage'], [schema.hasHowTo, 'HowTo'], [schema.hasArticle, 'Article'],
    [schema.hasOrganization, 'Organization'], [schema.hasPerson, 'Person'],
    [schema.hasBreadcrumb, 'BreadcrumbList'], [schema.hasProduct, 'Product'],
    [schema.hasLocalBusiness, 'LocalBusiness']
  ];
  schemaChecks.forEach(([has, name]) => {
    if (has) types += checkItem('pass', `<strong>${name}</strong>`);
  });
  if (schema.types.length > 0) {
    types += '<div class="tag-list">';
    schema.types.forEach((t) => {
      const isGood = ['FAQPage', 'HowTo', 'Article', 'BlogPosting', 'Person', 'Organization'].includes(t);
      types += `<span class="tag ${isGood ? 'tag-good' : ''}">${esc(t)}</span>`;
    });
    types += '</div>';
  }
  if (schema.hasMicrodata) types += checkItem('info', 'Microdata also detected');
  if (schema.hasRDFa) types += checkItem('info', 'RDFa also detected');

  // Sub-tab: Validation
  let validation = '';
  if (schema.hasSpeakable) validation += checkItem('pass', '<strong>Speakable</strong> markup (voice/AI ready)');
  else validation += checkItem('warn', 'No Speakable markup');
  if (schema.validationIssues && schema.validationIssues.length > 0) {
    schema.validationIssues.forEach((issue) => {
      validation += checkItem('fail', esc(issue));
    });
  } else {
    validation += checkItem('pass', 'No validation issues found');
  }

  body.innerHTML = subTabs([
    { id: 'sch-types', label: 'Types (' + schema.types.length + ')', content: types },
    { id: 'sch-valid', label: 'Validation', content: validation }
  ]);
}

function renderContentBody(headings, meta) {
  const body = document.getElementById('body-content');

  // Sub-tab: Checks
  let checks = '';
  if (headings.h1Count === 1) checks += checkItem('pass', `Single H1: <strong>${esc(truncate(headings.h1Text, 50))}</strong>`);
  else if (headings.h1Count === 0) checks += checkItem('fail', 'No H1 tag found');
  else checks += checkItem('warn', `${headings.h1Count} H1 tags (should be 1)`);
  checks += checkItem(headings.hierarchyClean ? 'pass' : 'warn', headings.hierarchyClean ? 'Heading hierarchy clean' : 'Heading hierarchy has gaps');
  checks += checkItem(headings.h2Count >= 2 ? 'pass' : 'warn', `<strong>${headings.h2Count}</strong> H2, <strong>${headings.h3Count}</strong> H3`);
  if (headings.faqCount >= 2) checks += checkItem('pass', `<strong>${headings.faqCount}</strong> question-style headings`);
  else if (headings.faqCount === 1) checks += checkItem('warn', '1 question heading — add more for AI');
  else checks += checkItem('warn', 'No question headings — AI prefers Q&A');
  checks += checkItem(headings.listCount >= 2 ? 'pass' : 'warn', `<strong>${headings.listCount}</strong> lists, <strong>${headings.tableCount}</strong> tables`);

  // Sub-tab: Meta
  let metaTab = '';
  if (meta.title) metaTab += checkItem(meta.titleLength >= 20 && meta.titleLength <= 70 ? 'pass' : 'warn', `Title: <strong>${esc(truncate(meta.title, 60))}</strong> (${meta.titleLength} chars)`);
  else metaTab += checkItem('fail', 'No title tag');
  if (meta.description) metaTab += checkItem(meta.descriptionLength >= 70 && meta.descriptionLength <= 160 ? 'pass' : 'warn', `Description: <strong>${esc(truncate(meta.description, 80))}</strong> (${meta.descriptionLength} chars)`);
  else metaTab += checkItem('fail', 'No meta description');
  metaTab += checkItem(meta.hasCanonical ? 'pass' : 'fail', meta.hasCanonical ? `Canonical: <strong>${esc(truncate(meta.canonicalUrl, 60))}</strong>` : 'No canonical URL');
  metaTab += checkItem(meta.lang ? 'pass' : 'warn', meta.lang ? `Language: <strong>${esc(meta.lang)}</strong>` : 'No lang attribute');
  if (meta.hasDatePublished) metaTab += checkItem('pass', `Published: <strong>${esc(meta.datePublished)}</strong>`);
  if (meta.hasDateModified) metaTab += checkItem('pass', `Modified: <strong>${esc(meta.dateModified)}</strong>`);
  if (meta.hasNoAI) metaTab += checkItem('fail', '<strong>noai</strong> directive found — AI blocked');
  if (meta.hasNoImageAI) metaTab += checkItem('warn', '<strong>noimageai</strong> directive found');

  // Sub-tab: Outline (heading tree)
  let outline = '';
  if (headings.headingTree && headings.headingTree.length > 0) {
    outline += '<div class="heading-tree">';
    headings.headingTree.forEach((h) => {
      const indent = (h.level - 1) * 16;
      const tagClass = h.level === 1 ? 'h-tag-1' : h.level === 2 ? 'h-tag-2' : 'h-tag-3';
      const qMark = h.isQuestion ? ' <span class="h-question">?</span>' : '';
      outline += `<div class="h-row" style="padding-left:${indent}px"><span class="h-tag ${tagClass}">H${h.level}</span><span class="h-text">${esc(h.text)}</span>${qMark}</div>`;
    });
    if (headings.totalHeadings > 30) outline += '<div class="h-row" style="color:#94a3b8;font-size:10px">... and ' + (headings.totalHeadings - 30) + ' more</div>';
    outline += '</div>';
  } else {
    outline = checkItem('warn', 'No headings found on page');
  }

  body.innerHTML = subTabs([
    { id: 'cnt-checks', label: 'Checks', content: checks },
    { id: 'cnt-meta', label: 'Meta', content: metaTab },
    { id: 'cnt-outline', label: 'Outline (' + (headings.totalHeadings || 0) + ')', content: outline }
  ]);
}

function renderEntityBody(meta, entity) {
  const body = document.getElementById('body-entity');

  // Sub-tab: OG & Meta
  let ogTab = '';
  const ogChecks = [meta.hasOgTitle, meta.hasOgDescription, meta.hasOgImage].filter(Boolean).length;
  ogTab += checkItem(ogChecks === 3 ? 'pass' : ogChecks > 0 ? 'warn' : 'fail', `Open Graph: <strong>${ogChecks}/3</strong> tags (title, desc, image)`);
  ogTab += checkItem(meta.hasOgType ? 'pass' : 'info', meta.hasOgType ? 'og:type present' : 'No og:type');
  ogTab += checkItem(meta.hasOgSiteName ? 'pass' : 'info', meta.hasOgSiteName ? 'og:site_name present' : 'No og:site_name');
  ogTab += checkItem(meta.hasTwitterCard ? 'pass' : 'warn', meta.hasTwitterCard ? 'Twitter card present' : 'No Twitter card');
  ogTab += checkItem(meta.hasAuthor ? 'pass' : 'warn', meta.hasAuthor ? `Author: <strong>${esc(meta.author)}</strong>` : 'No author meta');

  // Sub-tab: Social
  let socialTab = '';
  socialTab += checkItem(entity.socialLinkCount >= 2 ? 'pass' : entity.socialLinkCount >= 1 ? 'warn' : 'fail',
    `<strong>${entity.socialLinkCount}</strong> social profile link${entity.socialLinkCount !== 1 ? 's' : ''}`);
  if (entity.socialPlatforms.length > 0) {
    socialTab += '<div class="tag-list">';
    entity.socialPlatforms.forEach((p) => {
      socialTab += `<span class="tag tag-good">${esc(p.replace('.com', '').replace('.net', '').replace('.app', ''))}</span>`;
    });
    socialTab += '</div>';
  }
  socialTab += checkItem(entity.hasSameAs ? 'pass' : 'warn', entity.hasSameAs ? `<strong>sameAs</strong> linking (${entity.sameAsCount} URLs)` : 'No sameAs in schema');

  // Sub-tab: Trust Pages
  let trustTab = '';
  trustTab += checkItem(entity.hasAboutLink ? 'pass' : 'warn', entity.hasAboutLink ? 'About page found' : 'No About page link');
  trustTab += checkItem(entity.hasContactLink ? 'pass' : 'warn', entity.hasContactLink ? 'Contact page found' : 'No Contact page link');
  trustTab += checkItem(entity.hasPrivacyLink ? 'pass' : 'warn', entity.hasPrivacyLink ? 'Privacy policy found' : 'No privacy policy');
  trustTab += checkItem(entity.hasTermsLink ? 'pass' : 'info', entity.hasTermsLink ? 'Terms of service found' : 'No terms of service');

  body.innerHTML = subTabs([
    { id: 'ent-og', label: 'OG & Meta', content: ogTab },
    { id: 'ent-social', label: 'Social (' + entity.socialLinkCount + ')', content: socialTab },
    { id: 'ent-trust', label: 'Trust Pages', content: trustTab }
  ]);
}

function renderEEATBody(eeat, entity) {
  const body = document.getElementById('body-eeat');

  // Sub-tab: Author
  let authorTab = '';
  authorTab += checkItem(eeat.hasAuthorByline ? 'pass' : 'fail', eeat.hasAuthorByline ? 'Author byline detected' : 'No author byline');
  authorTab += checkItem(eeat.hasAuthorBio ? 'pass' : 'warn', eeat.hasAuthorBio ? 'Author bio found' : 'No author bio section');
  authorTab += checkItem(eeat.hasCredentials ? 'pass' : 'info', eeat.hasCredentials ? 'Credentials mentioned' : 'No credentials detected');
  authorTab += checkItem(eeat.hasVisibleDate ? 'pass' : 'warn', eeat.hasVisibleDate ? 'Publication date visible' : 'No visible date');

  // Sub-tab: Trust Signals
  let trustTab = '';
  trustTab += checkItem(eeat.citedSources >= 3 ? 'pass' : eeat.citedSources >= 1 ? 'warn' : 'fail', `<strong>${eeat.citedSources}</strong> external citations`);
  trustTab += checkItem(eeat.hasEditorialPolicy ? 'pass' : 'info', eeat.hasEditorialPolicy ? 'Editorial policy found' : 'No editorial policy');
  trustTab += checkItem(eeat.hasReviewedBy || eeat.hasFactCheckClaim ? 'pass' : 'info', eeat.hasReviewedBy || eeat.hasFactCheckClaim ? 'Review/fact-check signals' : 'No review signals');
  trustTab += checkItem(eeat.hasTrustBadges ? 'pass' : 'info', eeat.hasTrustBadges ? 'Trust badges detected' : 'No trust badges');
  trustTab += checkItem(entity.hasPrivacyLink ? 'pass' : 'warn', entity.hasPrivacyLink ? 'Privacy policy' : 'No privacy policy');
  trustTab += checkItem(entity.hasTermsLink ? 'pass' : 'info', entity.hasTermsLink ? 'Terms of service' : 'No terms link');

  body.innerHTML = subTabs([
    { id: 'eeat-author', label: 'Author', content: authorTab },
    { id: 'eeat-trust', label: 'Trust Signals', content: trustTab }
  ]);
}

function renderCiteabilityBody(cite) {
  const body = document.getElementById('body-citeability');

  // Sub-tab: Structure (paragraph analysis)
  let structure = '';
  structure += checkItem(cite.avgSentencesPerParagraph <= 3 ? 'pass' : cite.avgSentencesPerParagraph <= 4 ? 'warn' : 'fail',
    `Avg paragraph: <strong>${cite.avgSentencesPerParagraph}</strong> sentences (≤3 = quotable)`);
  const shortRatio = cite.totalParagraphs > 0 ? Math.round((cite.shortParagraphs / cite.totalParagraphs) * 100) : 0;
  structure += checkItem(shortRatio >= 70 ? 'pass' : shortRatio >= 40 ? 'warn' : 'fail',
    `<strong>${shortRatio}%</strong> short paragraphs (≤3 sentences)`);
  structure += checkItem(cite.firstParaAnswers ? 'pass' : 'warn',
    cite.firstParaAnswers ? 'First paragraph answers directly' : 'First paragraph lacks direct answer');
  structure += checkItem(cite.hasSummary ? 'pass' : 'warn',
    cite.hasSummary ? 'Summary/TL;DR found' : 'No summary section');
  if (cite.answerCapsuleCount !== undefined) {
    structure += checkItem(cite.answerCapsuleCount >= 2 ? 'pass' : cite.answerCapsuleCount >= 1 ? 'warn' : 'info',
      `<strong>${cite.answerCapsuleCount}</strong> answer capsule${cite.answerCapsuleCount !== 1 ? 's' : ''} (40-70 word blocks)`);
  }

  // Sub-tab: Signals (evidence & formatting)
  let signals = '';
  signals += checkItem(cite.definitionCount >= 3 ? 'pass' : cite.definitionCount >= 1 ? 'warn' : 'fail',
    `<strong>${cite.definitionCount}</strong> definition${cite.definitionCount !== 1 ? 's' : ''} ("X is...")`);
  signals += checkItem(cite.statCount >= 3 ? 'pass' : cite.statCount >= 1 ? 'warn' : 'info',
    `<strong>${cite.statCount}</strong> statistic${cite.statCount !== 1 ? 's' : ''} with numbers`);
  if (cite.attributedStats !== undefined) {
    signals += checkItem(cite.attributedStats > 0 ? 'pass' : 'warn',
      `<strong>${cite.attributedStats}</strong> attributed (with source), <strong>${cite.unattributedStats || 0}</strong> unattributed`);
  }
  if (cite.factDensity !== undefined) {
    signals += checkItem(cite.factDensity >= 3 ? 'pass' : cite.factDensity >= 1 ? 'warn' : 'info',
      `Fact density: <strong>${cite.factDensity.toFixed(1)}</strong> per 100 words`);
  }
  signals += checkItem(cite.boldCount >= 3 ? 'pass' : cite.boldCount >= 1 ? 'warn' : 'info',
    `<strong>${cite.boldCount}</strong> bold emphasis elements`);
  signals += checkItem(cite.listItemCount >= 5 ? 'pass' : cite.listItemCount >= 2 ? 'warn' : 'info',
    `<strong>${cite.listItemCount}</strong> list items (structured, easy to cite)`);
  signals += checkItem(cite.blockquoteCount >= 1 ? 'pass' : 'info',
    cite.blockquoteCount > 0 ? `<strong>${cite.blockquoteCount}</strong> blockquote${cite.blockquoteCount > 1 ? 's' : ''}` : 'No blockquotes');

  body.innerHTML = subTabs([
    { id: 'cite-struct', label: 'Structure', content: structure },
    { id: 'cite-signals', label: 'Signals', content: signals }
  ]);
}

function renderTechnicalBody(tech, content) {
  const body = document.getElementById('body-technical');

  // Sub-tab: Content
  let contentTab = '';
  if (content.wordCount >= 300) contentTab += checkItem('pass', `Word count: <strong>${content.wordCount.toLocaleString()}</strong>`);
  else if (content.wordCount >= 100) contentTab += checkItem('warn', `Word count: <strong>${content.wordCount.toLocaleString()}</strong> (aim 300+)`);
  else contentTab += checkItem('fail', `Word count: <strong>${content.wordCount.toLocaleString()}</strong> (thin)`);
  contentTab += checkItem(content.hasMainElement ? 'pass' : 'warn', content.hasMainElement ? '&lt;main&gt; element' : 'No &lt;main&gt;');
  contentTab += checkItem(content.hasArticleElement ? 'pass' : 'info', content.hasArticleElement ? '&lt;article&gt; element' : 'No &lt;article&gt;');
  if (tech.hasJSFramework) contentTab += checkItem('warn', 'JS framework detected — ensure SSR');

  // Sub-tab: Assets
  let assetsTab = '';
  if (tech.totalImages === 0) {
    assetsTab += checkItem('info', 'No images on page');
  } else {
    assetsTab += checkItem(tech.altTextRatio >= 90 ? 'pass' : tech.altTextRatio >= 60 ? 'warn' : 'fail',
      `Alt text: <strong>${tech.altTextRatio}%</strong> (${tech.imagesWithAlt}/${tech.totalImages} images)`);
  }
  assetsTab += checkItem(tech.internalLinks >= 5 ? 'pass' : tech.internalLinks >= 2 ? 'warn' : 'fail',
    `<strong>${tech.internalLinks}</strong> internal links`);
  assetsTab += checkItem(tech.externalLinks >= 1 ? 'pass' : 'info',
    `<strong>${tech.externalLinks}</strong> external links`);
  if (tech.hreflangCount > 0) assetsTab += checkItem('pass', `${tech.hreflangCount} hreflang tag${tech.hreflangCount > 1 ? 's' : ''}`);

  body.innerHTML = subTabs([
    { id: 'tech-content', label: 'HTML', content: contentTab },
    { id: 'tech-assets', label: 'Assets', content: assetsTab }
  ]);
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

function renderFreshnessBody(meta) {
  const body = document.getElementById('body-freshness');
  if (!body) return;
  let html = '';
  if (meta.freshnessDays !== null) {
    const level = meta.freshnessDays <= 30 ? 'pass' : meta.freshnessDays <= 90 ? 'pass' : meta.freshnessDays <= 180 ? 'warn' : 'fail';
    html += checkItem(level, 'Content age: <strong>' + meta.freshnessDays + ' days</strong> since last update');
    if (meta.dateModified) html += checkItem('info', 'Last modified: <strong>' + esc(meta.dateModified) + '</strong>');
    if (meta.datePublished) html += checkItem('info', 'Published: <strong>' + esc(meta.datePublished) + '</strong>');
    if (meta.freshnessDays > 180) html += checkItem('warn', 'AI platforms refresh citations frequently. Content older than 6 months may lose citations.');
  } else {
    html += checkItem('fail', 'No publication or modification date found');
    html += checkItem('info', 'Add datePublished and dateModified to your schema or meta tags');
  }
  body.innerHTML = html;
}

function renderPositionBody(cp) {
  const body = document.getElementById('body-position');
  if (!body) return;
  if (!cp) { body.innerHTML = checkItem('info', 'Citation position data not available'); return; }
  let html = '';
  html += checkItem(cp.zone1HasDirectAnswer ? 'pass' : 'fail', cp.zone1HasDirectAnswer ? 'First paragraph contains direct answer' : 'First paragraph lacks direct answer — AI skips to competitors');
  html += checkItem(cp.zone1DefinitionCount >= 2 ? 'pass' : cp.zone1DefinitionCount >= 1 ? 'warn' : 'fail', '<strong>' + cp.zone1DefinitionCount + '</strong> definitions in top 30% of content');
  html += checkItem(cp.zone1StatCount >= 2 ? 'pass' : cp.zone1StatCount >= 1 ? 'warn' : 'fail', '<strong>' + cp.zone1StatCount + '</strong> statistics in top 30% of content');
  html += checkItem(cp.zone1AttributionCount >= 1 ? 'pass' : 'warn', '<strong>' + cp.zone1AttributionCount + '</strong> source citations in top 30%');
  html += checkItem('info', 'Research: 44.2% of AI citations come from the first 30% of page content');
  body.innerHTML = html;
}

function renderAuthorityBody(sa) {
  const body = document.getElementById('body-authority');
  if (!body) return;
  if (!sa) { body.innerHTML = checkItem('info', 'Source authority data not available'); return; }
  let html = '';
  html += checkItem(sa.highCount >= 1 ? 'pass' : 'warn', '<strong>' + sa.highCount + '</strong> high-authority sources (.gov, .edu, Wikipedia, major publications)');
  html += checkItem(sa.mediumCount >= 1 ? 'pass' : 'info', '<strong>' + sa.mediumCount + '</strong> medium-authority sources (industry leaders, known tools)');
  html += checkItem('info', '<strong>' + sa.lowCount + '</strong> other external links');
  if (sa.totalExternal === 0) html += checkItem('fail', 'No external citations — AI trusts pages that cite authoritative sources');
  html += checkItem('info', 'Research: citing authoritative sources = +115% AI visibility for lower-ranked pages');
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

function subTabs(tabs) {
  // tabs = [{id, label, content}]
  let bar = '<div class="sub-tab-bar">';
  tabs.forEach((t, i) => {
    bar += `<button class="sub-tab${i === 0 ? ' active' : ''}" data-subtab="${t.id}">${t.label}</button>`;
  });
  bar += '</div>';

  let panels = '';
  tabs.forEach((t, i) => {
    panels += `<div class="sub-content${i === 0 ? ' active' : ''}" data-subpanel="${t.id}">${t.content}</div>`;
  });

  return bar + panels;
}

function initSubTabs() {
  document.querySelectorAll('.sub-tab-bar').forEach((bar) => {
    bar.querySelectorAll('.sub-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const id = tab.getAttribute('data-subtab');
        const parent = bar.parentElement;
        parent.querySelectorAll('.sub-tab').forEach((t) => t.classList.remove('active'));
        parent.querySelectorAll('.sub-content').forEach((p) => p.classList.remove('active'));
        tab.classList.add('active');
        const panel = parent.querySelector(`[data-subpanel="${id}"]`);
        if (panel) panel.classList.add('active');
      });
    });
  });
}

function fileLink(url, label) {
  return `<a href="${url}" target="_blank" rel="noopener" class="file-link" title="Open ${label}">${label} &#8599;</a>`;
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
