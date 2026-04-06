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
      performance: auditPerformance()
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

    const lists = document.querySelectorAll('ul, ol');
    const tables = document.querySelectorAll('table');

    return {
      h1Count: h1s.length,
      h1Text: h1s.length > 0 ? (h1s[0].textContent || '').trim() : null,
      h2Count: h2s.length,
      h3Count: h3s.length,
      totalHeadings: allHeadings.length,
      hierarchyClean,
      faqPatterns,
      faqCount: faqPatterns.length,
      listCount: lists.length,
      tableCount: tables.length
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
      hasDateModified: !!dateModified
    };
  }

  // ─── 4. Content Analysis ───────────────────────────────────
  function auditContent() {
    const mainContent =
      document.querySelector('main') ||
      document.querySelector('article') ||
      document.querySelector('[role="main"]') ||
      document.body;

    const text = (mainContent.innerText || '').trim();
    const words = text.split(/\s+/).filter((w) => w.length > 0);

    return {
      wordCount: words.length,
      hasMainElement: !!document.querySelector('main'),
      hasArticleElement: !!document.querySelector('article')
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
    const images = document.querySelectorAll('img');
    let imagesWithAlt = 0;
    let imagesWithoutAlt = 0;

    images.forEach((img) => {
      const alt = (img.getAttribute('alt') || '').trim();
      if (alt.length > 0) {
        imagesWithAlt++;
      } else {
        imagesWithoutAlt++;
      }
    });

    const allLinks = document.querySelectorAll('a[href]');
    let internalLinks = 0;
    let externalLinks = 0;
    const origin = window.location.origin;

    allLinks.forEach((a) => {
      const href = a.getAttribute('href') || '';
      if (href.startsWith('/') || href.startsWith(origin)) {
        internalLinks++;
      } else if (href.startsWith('http')) {
        externalLinks++;
      }
    });

    const noscript = document.querySelectorAll('noscript');
    const hasReactRoot =
      !!document.getElementById('__next') || !!document.getElementById('root') || !!document.getElementById('app');

    const hreflangs = document.querySelectorAll('link[hreflang]');
    const sitemapLink = document.querySelector('link[rel="sitemap"]');

    return {
      totalImages: images.length,
      imagesWithAlt,
      imagesWithoutAlt,
      altTextRatio: images.length > 0 ? Math.round((imagesWithAlt / images.length) * 100) : 100,
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
      firstParaAnswers
    };
  }

  // ─── 9. Performance Quick Check (NEW) ──────────────────────
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
})();
