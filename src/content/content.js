// AI Visibility Auditor v2 — Content Script
// Runs in the context of the active tab, extracts DOM data for audit

(() => {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action !== 'auditPage') return false;

    try {
      const audit = runFullAudit();
      sendResponse({ success: true, data: audit });
    } catch (err) {
      sendResponse({ success: false, error: err.message });
    }
    return true;
  });

  function runFullAudit() {
    return {
      url: window.location.href,
      origin: window.location.origin,
      schema: auditSchema(),
      headings: auditHeadings(),
      meta: auditMeta(),
      content: auditContent(),
      entity: auditEntity(),
      technical: auditTechnical(),
      eeat: auditEEAT(),
      citeability: auditCiteability(),
      performance: auditPerformance(),
      readability: auditReadability(),
      promotional: auditPromotionalTone(),
      pageType: detectPageType(),
      citationPosition: auditCitationPosition(),
      sourceAuthority: auditSourceAuthority()
    };
  }

  // ─── 1. Schema / Structured Data (with validation) ─────────
  function auditSchema() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    const types = new Set();
    let hasSpeakable = false;
    let hasFAQPage = false;
    let hasHowTo = false;
    let hasArticle = false;
    let hasOrganization = false;
    let hasPerson = false;
    let hasBreadcrumb = false;
    let hasProduct = false;
    let hasLocalBusiness = false;
    let invalidBlocks = 0;
    const validationIssues = [];

    scripts.forEach((script) => {
      try {
        const json = JSON.parse(script.textContent || '');
        const items = Array.isArray(json) ? json : [json];

        items.forEach((item) => {
          processSchemaItem(item);
          if (item['@graph'] && Array.isArray(item['@graph'])) {
            item['@graph'].forEach((graphItem) => processSchemaItem(graphItem));
          }
        });

        function processSchemaItem(item) {
          const itemType = item['@type'];
          if (!itemType) return;

          const typeList = Array.isArray(itemType) ? itemType : [itemType];
          typeList.forEach((t) => {
            types.add(t);
            if (t === 'FAQPage') {
              hasFAQPage = true;
              // Validate FAQPage
              if (!item.mainEntity || (Array.isArray(item.mainEntity) && item.mainEntity.length === 0)) {
                validationIssues.push('FAQPage: missing mainEntity with questions');
              }
            }
            if (t === 'HowTo') hasHowTo = true;
            if (t === 'Article' || t === 'NewsArticle' || t === 'BlogPosting') {
              hasArticle = true;
              // Validate Article
              if (!item.headline) validationIssues.push('Article: missing headline');
              if (!item.author) validationIssues.push('Article: missing author');
              if (!item.datePublished) validationIssues.push('Article: missing datePublished');
              if (!item.image) validationIssues.push('Article: missing image');
            }
            if (t === 'Organization') {
              hasOrganization = true;
              if (!item.name) validationIssues.push('Organization: missing name');
              if (!item.url) validationIssues.push('Organization: missing url');
              if (!item.logo) validationIssues.push('Organization: missing logo');
            }
            if (t === 'Person') {
              hasPerson = true;
              if (!item.name) validationIssues.push('Person: missing name');
            }
            if (t === 'BreadcrumbList') hasBreadcrumb = true;
            if (t === 'Product') hasProduct = true;
            if (t === 'LocalBusiness') hasLocalBusiness = true;
          });

          if (item.speakable) hasSpeakable = true;
        }
      } catch (e) {
        invalidBlocks++;
        validationIssues.push('Invalid JSON-LD block (parse error)');
      }
    });

    // Microdata
    const microdataItems = document.querySelectorAll('[itemscope]');
    microdataItems.forEach((el) => {
      const itemType = el.getAttribute('itemtype') || '';
      if (itemType) {
        const typeName = itemType.split('/').pop();
        if (typeName) types.add(typeName + ' (microdata)');
      }
    });

    // RDFa
    const rdfaItems = document.querySelectorAll('[typeof]');
    rdfaItems.forEach((el) => {
      const rdfType = el.getAttribute('typeof') || '';
      if (rdfType) types.add(rdfType + ' (RDFa)');
    });

    return {
      jsonLdCount: scripts.length,
      invalidBlocks,
      types: [...types],
      hasSpeakable,
      hasFAQPage,
      hasHowTo,
      hasArticle,
      hasOrganization,
      hasPerson,
      hasBreadcrumb,
      hasProduct,
      hasLocalBusiness,
      hasMicrodata: microdataItems.length > 0,
      hasRDFa: rdfaItems.length > 0,
      validationIssues
    };
  }

  // ─── 2. Heading Structure ──────────────────────────────────
  function auditHeadings() {
    const h1s = document.querySelectorAll('h1');
    const h2s = document.querySelectorAll('h2');
    const h3s = document.querySelectorAll('h3');
    const allHeadings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');

    let hierarchyClean = true;
    let prevLevel = 0;
    allHeadings.forEach((h) => {
      const level = parseInt(h.tagName[1]);
      if (prevLevel > 0 && level > prevLevel + 1) {
        hierarchyClean = false;
      }
      prevLevel = level;
    });

    const faqPatterns = [];
    allHeadings.forEach((h) => {
      const text = (h.textContent || '').trim();
      const lower = text.toLowerCase();
      if (
        text.endsWith('?') ||
        lower.startsWith('what ') ||
        lower.startsWith('how ') ||
        lower.startsWith('why ') ||
        lower.startsWith('when ') ||
        lower.startsWith('where ') ||
        lower.startsWith('who ') ||
        lower.startsWith('is ') ||
        lower.startsWith('can ') ||
        lower.startsWith('does ') ||
        lower.startsWith('should ')
      ) {
        faqPatterns.push(text);
      }
    });

    // Filter lists — exclude nav menus, only count content lists
    const contentArea = document.querySelector('main') || document.querySelector('article') || document.body;
    const allLists = contentArea.querySelectorAll('ul, ol');
    let listCount = 0;
    allLists.forEach((list) => {
      if (!list.closest('nav, header, footer, [role="navigation"], [role="banner"], [role="contentinfo"]')) listCount++;
    });

    // Filter tables — exclude layout tables (need at least 4 cells to be a data table)
    const allTables = contentArea.querySelectorAll('table');
    let tableCount = 0;
    allTables.forEach((table) => {
      if (!table.closest('nav, header, footer') && table.querySelectorAll('td, th').length >= 4) tableCount++;
    });

    // Filter headings — exclude hidden/aria-hidden
    const visibleHeadings = [];
    allHeadings.forEach((h) => {
      const style = window.getComputedStyle(h);
      if (style.display !== 'none' && style.visibility !== 'hidden' && h.getAttribute('aria-hidden') !== 'true') {
        visibleHeadings.push(h);
      }
    });

    // Full heading tree (limit to 30, visible only)
    const headingTree = [];
    let count = 0;
    visibleHeadings.forEach((h) => {
      if (count >= 30) return;
      const level = parseInt(h.tagName[1]);
      const text = (h.textContent || '').trim();
      if (text.length > 0) {
        headingTree.push({ level, text: text.substring(0, 80), isQuestion: faqPatterns.includes(text) });
        count++;
      }
    });

    return {
      h1Count: h1s.length,
      h1Text: h1s.length > 0 ? (h1s[0].textContent || '').trim() : null,
      h2Count: h2s.length,
      h3Count: h3s.length,
      totalHeadings: visibleHeadings.length,
      hierarchyClean,
      faqPatterns,
      faqCount: faqPatterns.length,
      listCount,
      tableCount,
      headingTree
    };
  }

  // ─── 3. Meta Tags ─────────────────────────────────────────
  function auditMeta() {
    const getMetaContent = (name) => {
      const el =
        document.querySelector(`meta[name="${name}"]`) ||
        document.querySelector(`meta[property="${name}"]`);
      return el ? el.getAttribute('content') : null;
    };

    const title = document.title || '';
    const description = getMetaContent('description');
    const ogTitle = getMetaContent('og:title');
    const ogDescription = getMetaContent('og:description');
    const ogImage = getMetaContent('og:image');
    const ogType = getMetaContent('og:type');
    const ogSiteName = getMetaContent('og:site_name');
    const twitterCard = getMetaContent('twitter:card');
    const twitterTitle = getMetaContent('twitter:title');
    const author = getMetaContent('author');
    const robots = getMetaContent('robots');
    const canonical = document.querySelector('link[rel="canonical"]');
    const lang = document.documentElement.lang || null;

    // Date detection
    const datePublished = getMetaContent('article:published_time') || getMetaContent('datePublished');
    const dateModified = getMetaContent('article:modified_time') || getMetaContent('dateModified');

    // Meta robots noai/noimageai detection
    const robotsLower = (robots || '').toLowerCase();
    const hasNoAI = robotsLower.includes('noai');
    const hasNoImageAI = robotsLower.includes('noimageai');

    // Content freshness calculation
    let freshnessDays = null;
    const dateStr = dateModified || datePublished;
    if (dateStr) {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        freshnessDays = Math.round((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
      }
    }

    return {
      title,
      titleLength: title.length,
      description,
      descriptionLength: description ? description.length : 0,
      hasOgTitle: !!ogTitle,
      hasOgDescription: !!ogDescription,
      hasOgImage: !!ogImage,
      hasOgType: !!ogType,
      hasOgSiteName: !!ogSiteName,
      hasTwitterCard: !!twitterCard,
      hasTwitterTitle: !!twitterTitle,
      hasAuthor: !!author,
      author,
      robotsDirective: robots,
      hasCanonical: !!canonical,
      canonicalUrl: canonical ? canonical.getAttribute('href') : null,
      lang,
      datePublished,
      dateModified,
      hasDatePublished: !!datePublished,
      hasDateModified: !!dateModified,
      hasNoAI,
      hasNoImageAI,
      freshnessDays
    };
  }

  // ─── 4. Content Analysis ───────────────────────────────────
  function auditContent() {
    const hasMain = !!document.querySelector('main');
    const hasArticle = !!document.querySelector('article');

    // Try multiple sources for text content (some frameworks render late)
    let text = '';

    // Priority 1: main or article element
    const mainEl = document.querySelector('main') || document.querySelector('article') || document.querySelector('[role="main"]');
    if (mainEl) {
      text = (mainEl.innerText || mainEl.textContent || '').trim();
    }

    // Priority 2: if main gave nothing, try body
    if (text.length < 50) {
      text = (document.body.innerText || document.body.textContent || '').trim();
    }

    // Priority 3: if still empty, gather all visible text from paragraphs, headings, lists
    if (text.length < 50) {
      const els = document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, td, th, span, div');
      const parts = [];
      els.forEach((el) => {
        const t = (el.textContent || '').trim();
        if (t.length > 2 && el.children.length === 0) parts.push(t);
      });
      text = parts.join(' ');
    }

    const words = text.split(/\s+/).filter((w) => w.length > 0);

    return {
      wordCount: words.length,
      hasMainElement: hasMain,
      hasArticleElement: hasArticle
    };
  }

  // ─── 5. Entity & Authority Signals ─────────────────────────
  function auditEntity() {
    const links = document.querySelectorAll('a[href]');
    let hasAboutLink = false;
    let hasContactLink = false;
    let hasPrivacyLink = false;
    let hasTermsLink = false;

    links.forEach((a) => {
      const href = (a.getAttribute('href') || '').toLowerCase();
      const text = (a.textContent || '').toLowerCase();
      if (href.includes('/about') || text.includes('about')) hasAboutLink = true;
      if (href.includes('/contact') || text.includes('contact')) hasContactLink = true;
      if (href.includes('/privacy') || text.includes('privacy policy')) hasPrivacyLink = true;
      if (href.includes('/terms') || text.includes('terms of service') || text.includes('terms and conditions')) hasTermsLink = true;
    });

    const socialPatterns = [
      'linkedin.com',
      'twitter.com',
      'x.com',
      'facebook.com',
      'youtube.com',
      'github.com',
      'instagram.com',
      'tiktok.com',
      'threads.net',
      'mastodon',
      'bsky.app',
      'medium.com'
    ];
    const socialLinks = [];
    links.forEach((a) => {
      const href = (a.getAttribute('href') || '').toLowerCase();
      socialPatterns.forEach((pattern) => {
        if (href.includes(pattern) && !socialLinks.includes(pattern)) {
          socialLinks.push(pattern);
        }
      });
    });

    const sameAsFound = [];
    document.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
      try {
        const json = JSON.parse(script.textContent || '');
        const items = Array.isArray(json) ? json : [json];
        items.forEach((item) => {
          collectSameAs(item);
          if (item['@graph']) {
            item['@graph'].forEach((g) => collectSameAs(g));
          }
        });
        function collectSameAs(obj) {
          if (obj.sameAs) {
            const urls = Array.isArray(obj.sameAs) ? obj.sameAs : [obj.sameAs];
            sameAsFound.push(...urls);
          }
        }
      } catch (e) {
        // skip
      }
    });

    return {
      hasAboutLink,
      hasContactLink,
      hasPrivacyLink,
      hasTermsLink,
      socialLinkCount: socialLinks.length,
      socialPlatforms: socialLinks,
      sameAsCount: sameAsFound.length,
      hasSameAs: sameAsFound.length > 0
    };
  }

  // ─── 6. Technical AI-Readiness ─────────────────────────────
  function auditTechnical() {
    const allImages = document.querySelectorAll('img');
    let imagesWithAlt = 0;
    let imagesWithoutAlt = 0;
    let totalImages = 0;
    let skippedImages = 0;

    allImages.forEach((img) => {
      // Skip tracking pixels, spacers, and invisible images
      const w = img.naturalWidth || img.width || parseInt(img.getAttribute('width')) || 0;
      const h = img.naturalHeight || img.height || parseInt(img.getAttribute('height')) || 0;
      const src = (img.getAttribute('src') || '').toLowerCase();
      const style = window.getComputedStyle(img);

      // Skip: 1x1 pixels, display:none, visibility:hidden, data URIs that are tiny, no src
      if ((w <= 2 && h <= 2) ||
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          (src.startsWith('data:') && src.length < 200) ||
          src === '' ||
          src.includes('pixel') ||
          src.includes('spacer') ||
          src.includes('tracking') ||
          src.includes('1x1')) {
        skippedImages++;
        return;
      }

      totalImages++;
      const alt = (img.getAttribute('alt') || '').trim();
      if (alt.length > 0) {
        imagesWithAlt++;
      } else {
        imagesWithoutAlt++;
      }
    });

    const images = { length: totalImages };

    const allLinks = document.querySelectorAll('a[href]');
    let internalLinks = 0;
    let externalLinks = 0;
    const origin = window.location.origin;

    // Skip CDN, tracking, and non-content links
    const skipDomains = ['cdn.', 'fonts.', 'analytics.', 'pixel.', 'tracking.', 'googletagmanager.', 'doubleclick.', 'googlesyndication.'];

    allLinks.forEach((a) => {
      const href = a.getAttribute('href') || '';
      const style = window.getComputedStyle(a);
      // Skip hidden links
      if (style.display === 'none' || style.visibility === 'hidden') return;
      // Skip javascript: and mailto: and tel:
      if (href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return;

      if (href.startsWith('/') || href.startsWith(origin)) {
        internalLinks++;
      } else if (href.startsWith('http')) {
        const isSkip = skipDomains.some((d) => href.includes(d));
        if (!isSkip) externalLinks++;
      }
    });

    const noscript = document.querySelectorAll('noscript');
    const hasReactRoot =
      !!document.getElementById('__next') || !!document.getElementById('root') || !!document.getElementById('app');

    const hreflangs = document.querySelectorAll('link[hreflang]');
    const sitemapLink = document.querySelector('link[rel="sitemap"]');

    return {
      totalImages,
      skippedImages,
      imagesWithAlt,
      imagesWithoutAlt,
      altTextRatio: totalImages > 0 ? Math.round((imagesWithAlt / totalImages) * 100) : 100,
      internalLinks,
      externalLinks,
      hasJSFramework: hasReactRoot,
      hasNoscriptFallback: noscript.length > 0,
      hreflangCount: hreflangs.length,
      hasSitemapLink: !!sitemapLink
    };
  }

  // ─── 7. E-E-A-T Signals (NEW) ─────────────────────────────
  function auditEEAT() {
    const bodyText = (document.body.innerText || '').toLowerCase();
    const links = document.querySelectorAll('a[href]');

    // Author detection
    let hasAuthorByline = false;
    let hasAuthorBio = false;
    const authorSelectors = [
      '[class*="author"]', '[id*="author"]',
      '[class*="byline"]', '[id*="byline"]',
      '[rel="author"]', '[itemprop="author"]',
      '.writer', '.contributor'
    ];
    authorSelectors.forEach((sel) => {
      const els = document.querySelectorAll(sel);
      if (els.length > 0) hasAuthorByline = true;
      els.forEach((el) => {
        if ((el.textContent || '').trim().length > 50) hasAuthorBio = true;
      });
    });

    // Publication date from visible content
    let hasVisibleDate = false;
    const dateSelectors = [
      'time[datetime]', '[class*="date"]', '[class*="published"]',
      '[class*="updated"]', '[class*="modified"]', '[itemprop="datePublished"]'
    ];
    dateSelectors.forEach((sel) => {
      if (document.querySelector(sel)) hasVisibleDate = true;
    });

    // Credentials detection
    const credentialPatterns = [
      'certified', 'licensed', 'accredited', 'phd', 'md', 'mba',
      'cpa', 'years of experience', 'year experience', 'expert in',
      'specialist in', 'professional', 'qualified', 'degree in',
      'board certified', 'fellow of'
    ];
    let hasCredentials = false;
    credentialPatterns.forEach((pattern) => {
      if (bodyText.includes(pattern)) hasCredentials = true;
    });

    // External source citations
    let citedSources = 0;
    links.forEach((a) => {
      const href = (a.getAttribute('href') || '').toLowerCase();
      if (href.startsWith('http') && !href.includes(window.location.hostname)) {
        // Check if link text suggests a citation
        const text = (a.textContent || '').trim();
        if (text.length > 2 && text.length < 200) {
          citedSources++;
        }
      }
    });

    // Editorial signals
    let hasEditorialPolicy = false;
    let hasFactCheckClaim = false;
    links.forEach((a) => {
      const href = (a.getAttribute('href') || '').toLowerCase();
      const text = (a.textContent || '').toLowerCase();
      if (href.includes('editorial') || text.includes('editorial policy') || text.includes('editorial guidelines')) {
        hasEditorialPolicy = true;
      }
      if (text.includes('fact-check') || text.includes('fact check') || text.includes('reviewed by')) {
        hasFactCheckClaim = true;
      }
    });

    // Review/rating signals
    const hasReviewedBy = bodyText.includes('reviewed by') || bodyText.includes('verified by') || bodyText.includes('edited by');

    // Trust badges
    const trustPatterns = ['[class*="trust"]', '[class*="badge"]', '[class*="secure"]', '[class*="verified"]'];
    let hasTrustBadges = false;
    trustPatterns.forEach((sel) => {
      if (document.querySelector(sel)) hasTrustBadges = true;
    });

    return {
      hasAuthorByline,
      hasAuthorBio,
      hasVisibleDate,
      hasCredentials,
      citedSources: Math.min(citedSources, 50), // cap for sanity
      hasEditorialPolicy,
      hasFactCheckClaim,
      hasReviewedBy,
      hasTrustBadges
    };
  }

  // ─── 8. Content Citeability (NEW) ──────────────────────────
  function auditCiteability() {
    const mainContent =
      document.querySelector('main') ||
      document.querySelector('article') ||
      document.querySelector('[role="main"]') ||
      document.body;

    // Paragraph analysis
    const paragraphs = mainContent.querySelectorAll('p');
    let totalSentences = 0;
    let shortParagraphs = 0; // < 3 sentences
    let longParagraphs = 0;  // > 5 sentences

    paragraphs.forEach((p) => {
      const text = (p.textContent || '').trim();
      if (text.length < 20) return; // skip tiny paragraphs
      const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 10);
      totalSentences += sentences.length;
      if (sentences.length <= 3) shortParagraphs++;
      if (sentences.length > 5) longParagraphs++;
    });

    const totalParagraphs = [...paragraphs].filter((p) => (p.textContent || '').trim().length >= 20).length;
    const avgSentencesPerParagraph = totalParagraphs > 0 ? Math.round((totalSentences / totalParagraphs) * 10) / 10 : 0;

    // Definition patterns ("X is..." "X refers to...")
    const bodyText = (mainContent.innerText || '');
    const definitionPatterns = bodyText.match(/\b\w[\w\s]{2,30}\b\s+(is|refers to|means|describes|represents|involves)\s/gi) || [];

    // Statistical claims with numbers
    const statPatterns = bodyText.match(/\d+(\.\d+)?(%|\s*percent|\s*million|\s*billion|\s*thousand)/gi) || [];

    // Bold/strong emphasis
    const boldElements = mainContent.querySelectorAll('strong, b');
    const boldCount = boldElements.length;

    // Summary/TL;DR detection
    let hasSummary = false;
    const allText = bodyText.toLowerCase();
    if (
      allText.includes('tl;dr') ||
      allText.includes('tldr') ||
      allText.includes('in summary') ||
      allText.includes('key takeaway') ||
      allText.includes('bottom line') ||
      allText.includes('quick summary') ||
      allText.includes('executive summary')
    ) {
      hasSummary = true;
    }
    // Also check headings for summary
    const headings = mainContent.querySelectorAll('h2, h3');
    headings.forEach((h) => {
      const hText = (h.textContent || '').toLowerCase();
      if (hText.includes('summary') || hText.includes('takeaway') || hText.includes('conclusion') || hText.includes('tl;dr')) {
        hasSummary = true;
      }
    });

    // Blockquotes (shows referenced content)
    const blockquotes = mainContent.querySelectorAll('blockquote');

    // Lists in content (structured, easy to cite)
    const lists = mainContent.querySelectorAll('ul, ol');
    let listItemCount = 0;
    lists.forEach((list) => {
      listItemCount += list.querySelectorAll('li').length;
    });

    // First paragraph quality - does it directly answer a question?
    let firstParaAnswers = false;
    const firstPara = mainContent.querySelector('p');
    if (firstPara) {
      const fpText = (firstPara.textContent || '').toLowerCase();
      if (
        fpText.includes(' is ') ||
        fpText.includes(' are ') ||
        fpText.includes(' means ') ||
        fpText.includes(' refers ') ||
        fpText.length > 50
      ) {
        firstParaAnswers = true;
      }
    }

    // Answer capsule detection: paragraphs 40-70 words, starts with definition/answer pattern, self-contained
    let answerCapsuleCount = 0;
    const definitionStarters = /^[A-Z][\w\s]{2,40}\b\s+(is|are|refers to|means|describes|represents|involves|was|were)\s/;
    paragraphs.forEach((p) => {
      const pText = (p.textContent || '').trim();
      if (pText.length < 50) return;
      const pWords = pText.split(/\s+/).filter((w) => w.length > 0);
      if (pWords.length >= 40 && pWords.length <= 70 && definitionStarters.test(pText)) {
        answerCapsuleCount++;
      }
    });

    // Stat attribution quality
    let attributedStats = 0;
    let unattributedStats = 0;
    const allStats = bodyText.match(/\d+(\.\d+)?(%|\s*percent|\s*million|\s*billion|\s*thousand)/gi) || [];
    allStats.forEach((stat) => {
      // Find position of stat in bodyText
      const idx = bodyText.indexOf(stat);
      if (idx === -1) return;
      const after = bodyText.substring(idx, idx + stat.length + 100);
      if (/\([\w\s]+,?\s*\d{4}\)/.test(after)) {
        attributedStats++;
      } else {
        unattributedStats++;
      }
    });

    // Fact density: count verifiable claims per 100 words
    const wordCount = bodyText.split(/\s+/).filter((w) => w.length > 0).length;
    let factCount = 0;
    // Numbers with context
    factCount += (bodyText.match(/\d+(\.\d+)?(%|\s*percent|\s*million|\s*billion|\s*thousand|\s*kg|\s*miles|\s*km|\s*years)/gi) || []).length;
    // Cited sources (parenthetical citations)
    factCount += (bodyText.match(/\([\w\s]+,?\s*\d{4}\)/g) || []).length;
    const factDensity = wordCount > 0 ? Math.round((factCount / wordCount) * 10000) / 100 : 0;

    return {
      totalParagraphs,
      shortParagraphs,
      longParagraphs,
      avgSentencesPerParagraph,
      definitionCount: definitionPatterns.length,
      statCount: statPatterns.length,
      boldCount,
      hasSummary,
      blockquoteCount: blockquotes.length,
      listItemCount,
      firstParaAnswers,
      answerCapsuleCount,
      attributedStats,
      unattributedStats,
      factDensity
    };
  }

  // ─── 9. Readability Scoring (NEW v2.1) ─────────────────────
  function auditReadability() {
    const mainContent =
      document.querySelector('main') ||
      document.querySelector('article') ||
      document.querySelector('[role="main"]') ||
      document.body;

    const text = (mainContent.innerText || '').trim();
    const words = text.split(/\s+/).filter((w) => w.length > 0);
    const wordCount = words.length;
    if (wordCount < 10) {
      return { ari: 0, gradeLevel: 'N/A', avgSentenceLength: 0, passiveVoicePercent: 0, passiveCount: 0, sentenceCount: 0 };
    }

    const chars = text.replace(/[^a-zA-Z0-9]/g, '').length;
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 5);
    const sentenceCount = Math.max(sentences.length, 1);

    // ARI formula
    const ari = 4.71 * (chars / wordCount) + 0.5 * (wordCount / sentenceCount) - 21.43;
    const ariRounded = Math.round(ari * 10) / 10;

    // Grade level from ARI
    let gradeLevel = 'College+';
    if (ari <= 1) gradeLevel = 'K';
    else if (ari <= 13) gradeLevel = 'Grade ' + Math.ceil(ari);
    else gradeLevel = 'College+';

    const avgSentenceLength = Math.round((wordCount / sentenceCount) * 10) / 10;

    // Passive voice detection
    const passiveRegex = /\b(is|are|was|were|been|being)\s+(being\s+)?\w+(ed|en)\b/gi;
    const exclusions = ['interested', 'excited', 'pleased', 'concerned', 'experienced', 'surprised', 'used', 'supposed', 'based', 'related', 'married', 'divorced', 'retired'];
    let passiveCount = 0;
    let match;
    while ((match = passiveRegex.exec(text)) !== null) {
      const matchedWords = match[0].toLowerCase().split(/\s+/);
      const lastWord = matchedWords[matchedWords.length - 1];
      const isExcluded = exclusions.some((e) => lastWord.startsWith(e));
      if (!isExcluded) passiveCount++;
    }
    const passiveVoicePercent = sentenceCount > 0 ? Math.round((passiveCount / sentenceCount) * 100) : 0;

    return {
      ari: ariRounded,
      gradeLevel,
      avgSentenceLength,
      passiveVoicePercent,
      passiveCount,
      sentenceCount
    };
  }

  // ─── 10. Promotional Tone Detector (NEW v2.1) ─────────────
  function auditPromotionalTone() {
    const mainContent =
      document.querySelector('main') ||
      document.querySelector('article') ||
      document.querySelector('[role="main"]') ||
      document.body;

    const text = (mainContent.innerText || '').trim();
    const words = text.split(/\s+/).filter((w) => w.length > 0);
    const wordCount = words.length;
    if (wordCount < 20) {
      return { score: 100, brandRatio: 0, brandCount: 0, unsupportedSuperlatives: 0, ctaDensity: 0, ctaCount: 0, benefitFactRatio: 0, comparativeCount: 0 };
    }

    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 5);
    const sentenceCount = Math.max(sentences.length, 1);

    // Signal 1: Brand-centric language ratio
    const brandMatches = text.match(/\b(our|we|my)\s+(service|product|team|approach|solution|method|tool|platform|company|brand|offer|experience|expertise)\b/gi) || [];
    const brandCount = brandMatches.length;
    const brandRatio = Math.round((brandCount / sentenceCount) * 100);

    // Signal 2: Unsupported superlatives
    const superlativeRegex = /\b(best-in-class|industry-leading|world-class|cutting-edge|proven|guaranteed|unmatched|unparalleled|top-rated|award-winning|leading|premier|elite)\b/gi;
    const superlativeMatches = [];
    let supMatch;
    while ((supMatch = superlativeRegex.exec(text)) !== null) {
      superlativeMatches.push(supMatch);
    }
    let unsupportedSuperlatives = 0;
    superlativeMatches.forEach((m) => {
      const after = text.substring(m.index, m.index + m[0].length + 150);
      if (!/\(.+\d{4}\)/.test(after)) {
        unsupportedSuperlatives++;
      }
    });

    // Signal 3: CTA density
    const ctaMatches = text.match(/\b(get started|sign up|book a|contact us|try .{0,10}free|download now|learn more|request a demo|schedule|buy now|order now|start now|join now)\b/gi) || [];
    const ctaCount = ctaMatches.length;
    const ctaDensity = wordCount > 0 ? Math.round((ctaCount / (wordCount / 1000)) * 10) / 10 : 0;

    // Signal 4: Benefit-fact ratio
    const benefitMatches = text.match(/\b(helps you|saves you|enables you|allows you|designed to|built for|so you can|giving you|empowers you)\b/gi) || [];
    const statPatterns = text.match(/\d+(\.\d+)?(%|\s*percent|\s*million|\s*billion|\s*thousand)/gi) || [];
    const citationPatterns = text.match(/\([\w\s]+,?\s*\d{4}\)/g) || [];
    const factPatternCount = statPatterns.length + citationPatterns.length;
    const benefitFactRatio = factPatternCount > 0 ? Math.round((benefitMatches.length / factPatternCount) * 100) / 100 : (benefitMatches.length > 0 ? 1.0 : 0);

    // Signal 5: Comparative self-promotion
    const comparativeMatches = text.match(/\b(unlike (others|competitors|other tools)|better than|more than just|not like other|the only .{0,20} that|what sets us apart|why choose us)\b/gi) || [];
    const comparativeCount = comparativeMatches.length;

    // Scoring: start at 100, deduct per signal
    let score = 100;
    if (brandRatio > 15) score -= 30;
    else if (brandRatio >= 5) score -= 15;

    if (unsupportedSuperlatives >= 4) score -= 25;
    else if (unsupportedSuperlatives >= 1) score -= 12;

    if (ctaDensity >= 4) score -= 20;
    else if (ctaDensity >= 2) score -= 10;

    if (benefitFactRatio > 0.6) score -= 20;
    else if (benefitFactRatio >= 0.3) score -= 10;

    if (comparativeCount >= 3) score -= 15;
    else if (comparativeCount >= 1) score -= 8;

    score = Math.max(0, Math.min(100, score));

    return {
      score,
      brandRatio,
      brandCount,
      unsupportedSuperlatives,
      ctaDensity,
      ctaCount,
      benefitFactRatio,
      comparativeCount
    };
  }

  // ─── 11. Page Type Detection (NEW v2.1) ───────────────────
  function detectPageType() {
    const url = window.location.pathname.toLowerCase();
    const schema = document.querySelectorAll('script[type="application/ld+json"]');
    const ogType = (document.querySelector('meta[property="og:type"]') || {}).content || '';
    const hasArticleTag = !!document.querySelector('article');
    const bodyText = (document.body.innerText || '').toLowerCase();

    let schemaTypes = [];
    schema.forEach((s) => {
      try {
        const json = JSON.parse(s.textContent || '');
        const items = Array.isArray(json) ? json : [json];
        items.forEach((item) => {
          if (item['@type']) {
            const types = Array.isArray(item['@type']) ? item['@type'] : [item['@type']];
            schemaTypes.push(...types);
          }
          if (item['@graph'] && Array.isArray(item['@graph'])) {
            item['@graph'].forEach((g) => {
              if (g['@type']) {
                const types = Array.isArray(g['@type']) ? g['@type'] : [g['@type']];
                schemaTypes.push(...types);
              }
            });
          }
        });
      } catch (e) { /* skip */ }
    });

    const hasDatePublished = !!(document.querySelector('meta[property="article:published_time"]') || document.querySelector('meta[name="datePublished"]'));
    const hasAuthor = !!document.querySelector('meta[name="author"]');

    let type = 'general';

    // Homepage detection
    if (url === '/' || url === '' || url === '/index.html' || url === '/index.php') {
      type = 'homepage';
    } else if (schemaTypes.includes('Organization') && (url === '/' || url === '')) {
      type = 'homepage';
    } else if (ogType === 'website' && (url === '/' || url === '')) {
      type = 'homepage';
    }

    // Blog/article detection
    if (schemaTypes.includes('Article') || schemaTypes.includes('BlogPosting') || schemaTypes.includes('NewsArticle')) {
      type = 'blog';
    } else if (hasArticleTag && (hasDatePublished || hasAuthor)) {
      type = 'blog';
    } else if (url.includes('/blog/') || url.includes('/post/') || url.includes('/article/')) {
      type = 'blog';
    }

    // Product detection
    if (schemaTypes.includes('Product')) {
      type = 'product';
    } else if (url.includes('/product/') || url.includes('/shop/') || url.includes('/store/')) {
      type = 'product';
    }

    // Service detection
    if (url.includes('/service') || url.includes('/services')) {
      type = 'service';
    } else if (schemaTypes.includes('LocalBusiness') || schemaTypes.includes('ProfessionalService')) {
      type = 'service';
    }

    // YMYL detection
    const ymylTerms = ['diagnosis', 'prescription', 'investment', 'attorney', 'lawsuit', 'insurance claim', 'medication', 'treatment plan', 'financial advice', 'legal advice', 'medical advice', 'tax filing', 'mortgage', 'bankruptcy'];
    let isYMYL = false;
    ymylTerms.forEach((term) => {
      if (bodyText.includes(term)) isYMYL = true;
    });

    return { type, isYMYL };
  }

  // ─── 12. Performance Quick Check (NEW) ──────────────────────
  function auditPerformance() {
    const perf = window.performance;
    let domContentLoaded = null;
    let pageLoaded = null;

    if (perf && perf.timing) {
      const t = perf.timing;
      if (t.domContentLoadedEventEnd > 0 && t.navigationStart > 0) {
        domContentLoaded = t.domContentLoadedEventEnd - t.navigationStart;
      }
      if (t.loadEventEnd > 0 && t.navigationStart > 0) {
        pageLoaded = t.loadEventEnd - t.navigationStart;
      }
    }

    // Try Navigation Timing API v2
    if (perf && perf.getEntriesByType) {
      const navEntries = perf.getEntriesByType('navigation');
      if (navEntries.length > 0) {
        const nav = navEntries[0];
        if (!domContentLoaded && nav.domContentLoadedEventEnd) {
          domContentLoaded = Math.round(nav.domContentLoadedEventEnd);
        }
        if (!pageLoaded && nav.loadEventEnd) {
          pageLoaded = Math.round(nav.loadEventEnd);
        }
      }
    }

    // DOM complexity
    const domNodes = document.querySelectorAll('*').length;

    // Resource count
    let resourceCount = 0;
    if (perf && perf.getEntriesByType) {
      resourceCount = perf.getEntriesByType('resource').length;
    }

    // Render-blocking detection (stylesheets in head without media/async)
    const renderBlockingCSS = document.querySelectorAll('head link[rel="stylesheet"]:not([media="print"]):not([media="(max-width:0px)"])');
    const renderBlockingJS = document.querySelectorAll('head script[src]:not([async]):not([defer]):not([type="module"])');

    return {
      domContentLoaded: domContentLoaded ? Math.round(domContentLoaded) : null,
      pageLoaded: pageLoaded ? Math.round(pageLoaded) : null,
      domNodes,
      resourceCount,
      renderBlockingCSS: renderBlockingCSS.length,
      renderBlockingJS: renderBlockingJS.length
    };
  }

  // ─── 13. Citation Position (NEW) ──────────────────────────
  function auditCitationPosition() {
    const mainContent =
      document.querySelector('main') ||
      document.querySelector('article') ||
      document.querySelector('[role="main"]') ||
      document.body;

    const text = (mainContent.innerText || '').trim();
    const words = text.split(/\s+/).filter((w) => w.length > 0);
    const totalWordCount = words.length;
    if (totalWordCount < 30) {
      return { zone1DefinitionCount: 0, zone1StatCount: 0, zone1AttributionCount: 0, zone1HasDirectAnswer: false, zone1WordCount: 0, totalWordCount, zone1Percentage: 0 };
    }

    // Split into zone 1 (first 30%)
    const zone1End = Math.floor(totalWordCount * 0.3);
    const zone1Text = words.slice(0, zone1End).join(' ');
    const zone1WordCount = zone1End;

    // Definition patterns in zone 1
    const zone1Definitions = zone1Text.match(/\b[A-Z][\w\s]{2,40}\b\s+(is|are|refers to|means|describes)\s/g) || [];
    const zone1DefinitionCount = zone1Definitions.length;

    // Statistics in zone 1
    const zone1Stats = zone1Text.match(/\d+(\.\d+)?(%|\s*percent|\s*million|\s*billion)/g) || [];
    const zone1StatCount = zone1Stats.length;

    // Attribution in zone 1
    const zone1Attributions = zone1Text.match(/\([^)]*\d{4}[^)]*\)/g) || [];
    const zone1AttributionCount = zone1Attributions.length;

    // First paragraph direct answer check
    let zone1HasDirectAnswer = false;
    const firstPara = mainContent.querySelector('p');
    if (firstPara) {
      const fpText = (firstPara.textContent || '').trim();
      if (fpText.length > 30 && (fpText.includes(' is ') || fpText.includes(' are '))) {
        zone1HasDirectAnswer = true;
      }
    }

    // What % of key signals are in zone 1
    const totalDefs = (text.match(/\b[A-Z][\w\s]{2,40}\b\s+(is|are|refers to|means|describes)\s/g) || []).length;
    const totalStats = (text.match(/\d+(\.\d+)?(%|\s*percent|\s*million|\s*billion)/g) || []).length;
    const totalAttrs = (text.match(/\([^)]*\d{4}[^)]*\)/g) || []).length;
    const totalSignals = totalDefs + totalStats + totalAttrs;
    const zone1Signals = zone1DefinitionCount + zone1StatCount + zone1AttributionCount;
    const zone1Percentage = totalSignals > 0 ? Math.round((zone1Signals / totalSignals) * 100) : 0;

    return {
      zone1DefinitionCount,
      zone1StatCount,
      zone1AttributionCount,
      zone1HasDirectAnswer,
      zone1WordCount,
      totalWordCount,
      zone1Percentage
    };
  }

  // ─── 14. Source Authority (NEW) ────────────────────────────
  function auditSourceAuthority() {
    const links = document.querySelectorAll('a[href]');
    const origin = window.location.origin;

    const highAuthority = ['gov', 'edu', 'wikipedia.org', 'who.int', 'nature.com', 'sciencedirect.com', 'pubmed.ncbi', 'nih.gov', 'reuters.com', 'bbc.com', 'nytimes.com', 'washingtonpost.com', 'theguardian.com'];
    const mediumAuthority = ['semrush.com', 'ahrefs.com', 'hubspot.com', 'mckinsey.com', 'gartner.com', 'statista.com', 'forbes.com', 'techcrunch.com', 'harvard.edu', 'mit.edu', 'stanford.edu', 'oxford.ac.uk', 'springer.com', 'wiley.com', 'ieee.org', 'acm.org'];

    let highCount = 0, mediumCount = 0, lowCount = 0;

    links.forEach((a) => {
      const href = (a.getAttribute('href') || '').toLowerCase();
      if (!href.startsWith('http') || href.includes(origin.toLowerCase())) return;

      if (highAuthority.some(d => href.includes(d)) || href.match(/\.gov(\/|$)/) || href.match(/\.edu(\/|$)/)) {
        highCount++;
      } else if (mediumAuthority.some(d => href.includes(d))) {
        mediumCount++;
      } else {
        lowCount++;
      }
    });

    return { highCount, mediumCount, lowCount, totalExternal: highCount + mediumCount + lowCount };
  }
})();
