// AI Visibility Auditor v2 — Background Service Worker
// Fetches robots.txt, llms.txt, llms-full.txt with improved parsing

const AI_CRAWLERS = [
  // Training crawlers (used for model training)
  { name: 'GPTBot', owner: 'OpenAI', userAgent: 'GPTBot', type: 'training' },
  { name: 'ChatGPT-User', owner: 'OpenAI', userAgent: 'ChatGPT-User', type: 'search' },
  { name: 'OAI-SearchBot', owner: 'OpenAI', userAgent: 'OAI-SearchBot', type: 'search' },
  { name: 'ClaudeBot', owner: 'Anthropic', userAgent: 'ClaudeBot', type: 'training' },
  { name: 'anthropic-ai', owner: 'Anthropic', userAgent: 'anthropic-ai', type: 'training' },
  { name: 'PerplexityBot', owner: 'Perplexity AI', userAgent: 'PerplexityBot', type: 'search' },
  { name: 'Google-Extended', owner: 'Google AI', userAgent: 'Google-Extended', type: 'training' },
  { name: 'Googlebot', owner: 'Google Search', userAgent: 'Googlebot', type: 'search' },
  { name: 'Amazonbot', owner: 'Amazon', userAgent: 'Amazonbot', type: 'training' },
  { name: 'Applebot-Extended', owner: 'Apple AI', userAgent: 'Applebot-Extended', type: 'training' },
  { name: 'Bingbot', owner: 'Microsoft', userAgent: 'Bingbot', type: 'search' },
  { name: 'YouBot', owner: 'You.com', userAgent: 'YouBot', type: 'search' },
  { name: 'DuckAssistBot', owner: 'DuckDuckGo AI', userAgent: 'DuckAssistBot', type: 'search' },
  { name: 'FacebookBot', owner: 'Meta', userAgent: 'FacebookBot', type: 'training' },
  { name: 'cohere-ai', owner: 'Cohere', userAgent: 'cohere-ai', type: 'training' },
  { name: 'Bytespider', owner: 'ByteDance', userAgent: 'Bytespider', type: 'training' },
  { name: 'CCBot', owner: 'Common Crawl', userAgent: 'CCBot', type: 'training' }
];

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchRobotsTxt') {
    handleRobotsFetch(request.origin).then(sendResponse);
    return true;
  }
  if (request.action === 'fetchLlmsTxt') {
    handleLlmsFetch(request.origin).then(sendResponse);
    return true;
  }
});

async function handleRobotsFetch(origin) {
  try {
    const response = await fetch(`${origin}/robots.txt`, {
      method: 'GET',
      cache: 'no-cache'
    });

    if (!response.ok) {
      return {
        success: true,
        data: {
          found: false,
          sitemaps: [],
          crawlers: AI_CRAWLERS.map((c) => ({
            ...c,
            status: 'no-robots',
            detail: 'No robots.txt found -- all crawlers allowed by default',
            crawlDelay: null
          }))
        }
      };
    }

    const text = await response.text();
    const parsed = parseRobotsTxt(text);

    return {
      success: true,
      data: {
        found: true,
        raw: text.substring(0, 5000),
        sitemaps: parsed.sitemaps,
        crawlers: parsed.crawlers
      }
    };
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
}

function parseRobotsTxt(text) {
  const lines = text.split('\n');
  const rules = []; // { userAgent, directives[], crawlDelay }
  const sitemaps = [];
  let currentAgents = [];

  for (let rawLine of lines) {
    // Strip inline comments (but keep the part before #)
    const commentIdx = rawLine.indexOf('#');
    const line = (commentIdx >= 0 ? rawLine.substring(0, commentIdx) : rawLine).trim();

    if (line === '') {
      if (currentAgents.length > 0) {
        currentAgents = [];
      }
      continue;
    }

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const field = line.substring(0, colonIdx).trim().toLowerCase();
    const value = line.substring(colonIdx + 1).trim();

    if (field === 'sitemap') {
      sitemaps.push(value);
      continue;
    }

    if (field === 'user-agent') {
      currentAgents.push(value);
      if (!rules.find((r) => r.userAgent === value)) {
        rules.push({ userAgent: value, directives: [], crawlDelay: null });
      }
    } else if (field === 'disallow' || field === 'allow') {
      currentAgents.forEach((agent) => {
        const rule = rules.find((r) => r.userAgent === agent);
        if (rule) {
          rule.directives.push({ type: field, path: value });
        }
      });
    } else if (field === 'crawl-delay') {
      const delay = parseFloat(value);
      if (!isNaN(delay)) {
        currentAgents.forEach((agent) => {
          const rule = rules.find((r) => r.userAgent === agent);
          if (rule) rule.crawlDelay = delay;
        });
      }
    }
  }

  // Evaluate each AI crawler
  const crawlers = AI_CRAWLERS.map((crawler) => {
    const specificRule = rules.find(
      (r) => r.userAgent.toLowerCase() === crawler.userAgent.toLowerCase()
    );
    const wildcardRule = rules.find((r) => r.userAgent === '*');

    let status = 'allowed';
    let detail = 'No specific rules found -- allowed by default';
    let crawlDelay = null;

    if (specificRule) {
      crawlDelay = specificRule.crawlDelay;
      const hasFullBlock = specificRule.directives.some(
        (d) => d.type === 'disallow' && (d.path === '/' || d.path === '')
      );
      const hasAllow = specificRule.directives.some((d) => d.type === 'allow');
      const hasPartialBlock = specificRule.directives.some(
        (d) => d.type === 'disallow' && d.path && d.path !== '/'
      );

      if (hasFullBlock && !hasAllow) {
        status = 'blocked';
        detail = 'Explicitly blocked: Disallow: /';
      } else if (hasFullBlock && hasAllow) {
        status = 'partial';
        const allowedPaths = specificRule.directives
          .filter((d) => d.type === 'allow')
          .map((d) => d.path)
          .join(', ');
        detail = 'Blocked with exceptions: Allow: ' + allowedPaths;
      } else if (hasPartialBlock) {
        status = 'partial';
        const blockedPaths = specificRule.directives
          .filter((d) => d.type === 'disallow' && d.path)
          .map((d) => d.path)
          .join(', ');
        detail = 'Some paths blocked: ' + blockedPaths;
      } else {
        status = 'allowed';
        detail = 'Specific rules found -- allowed';
      }
    } else if (wildcardRule) {
      crawlDelay = wildcardRule.crawlDelay;
      const hasFullBlock = wildcardRule.directives.some(
        (d) => d.type === 'disallow' && d.path === '/'
      );
      if (hasFullBlock) {
        status = 'blocked';
        detail = 'Blocked by wildcard: User-agent: * Disallow: /';
      } else {
        status = 'allowed';
        detail = 'Allowed under wildcard rules';
      }
    }

    return {
      ...crawler,
      status,
      detail,
      crawlDelay
    };
  });

  return { crawlers, sitemaps };
}

async function handleLlmsFetch(origin) {
  const results = {
    llmsTxt: { found: false, content: null },
    llmsFullTxt: { found: false, content: null }
  };

  const fetchFile = async (path) => {
    try {
      const resp = await fetch(`${origin}${path}`, { method: 'GET', cache: 'no-cache' });
      if (resp.ok) {
        const text = await resp.text();
        if (!text.trim().startsWith('<!') && !text.trim().startsWith('<html')) {
          return {
            found: true,
            content: text.substring(0, 2000),
            length: text.length
          };
        }
      }
    } catch (e) {
      // not found
    }
    return { found: false, content: null };
  };

  const [llmsTxt, llmsFullTxt] = await Promise.all([
    fetchFile('/llms.txt'),
    fetchFile('/llms-full.txt')
  ]);

  results.llmsTxt = llmsTxt;
  results.llmsFullTxt = llmsFullTxt;

  return { success: true, data: results };
}
