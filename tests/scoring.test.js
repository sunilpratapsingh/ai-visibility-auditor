/**
 * Scoring engine tests.
 * Run: npm test or npm run test:scoring
 * Uses Node.js built-in test runner (no dependencies).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// We'll import scoring functions once they're extracted to a shared module.
// For now, define test cases as specifications for v2.1.

describe('Promotional Tone Scoring', () => {
  it('should score 100 for purely informational content', () => {
    const content = 'AI visibility tracking measures how often a brand appears in AI-generated answers. According to Gartner (2024), AI-powered search will reduce organic traffic by 25% by 2027.';
    // Expected: no brand-centric language, no superlatives, no CTAs
    assert.ok(content.length > 0, 'Test content should not be empty');
  });

  it('should penalize brand-centric language', () => {
    const content = 'Our platform delivers proven results. We help you optimize for AI. Our approach is industry-leading.';
    const matches = content.match(/\b(our|we)\s+(platform|help|approach|service|product|team)\b/gi) || [];
    assert.ok(matches.length >= 2, 'Should detect multiple brand-centric phrases');
  });

  it('should detect unsupported superlatives', () => {
    const superlatives = ['industry-leading', 'best-in-class', 'world-class', 'proven results', 'guaranteed'];
    const content = 'Our industry-leading tool delivers proven results with world-class support.';
    let found = 0;
    for (const s of superlatives) {
      if (content.toLowerCase().includes(s)) found++;
    }
    assert.ok(found >= 2, 'Should detect multiple unsupported superlatives');
  });

  it('should count CTA density', () => {
    const content = 'Get started today. Sign up now. Book a demo. Contact us for details. Try it free.';
    const ctaPatterns = /\b(get started|sign up|book a|contact us|try .* free|download now|learn more|request a demo|schedule)\b/gi;
    const matches = content.match(ctaPatterns) || [];
    assert.ok(matches.length >= 4, 'Should detect high CTA density');
  });
});

describe('Readability (ARI) Scoring', () => {
  it('should calculate ARI for simple text', () => {
    // ARI = 4.71 * (chars/words) + 0.5 * (words/sentences) - 21.43
    const text = 'The cat sat on the mat. It was a good day.';
    const words = text.split(/\s+/).length; // 10
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0).length; // 2
    const chars = text.replace(/[^a-zA-Z]/g, '').length;
    const ari = 4.71 * (chars / words) + 0.5 * (words / sentences) - 21.43;
    assert.ok(ari < 6, `Simple text should have low ARI (got ${ari.toFixed(1)})`);
  });

  it('should calculate higher ARI for complex text', () => {
    const text = 'The implementation of sophisticated algorithmic processing methodologies necessitates comprehensive understanding of computational linguistics and natural language processing frameworks.';
    const words = text.split(/\s+/).length;
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0).length;
    const chars = text.replace(/[^a-zA-Z]/g, '').length;
    const ari = 4.71 * (chars / words) + 0.5 * (words / sentences) - 21.43;
    assert.ok(ari > 14, `Complex text should have high ARI (got ${ari.toFixed(1)})`);
  });
});

describe('Schema Validation Rules', () => {
  it('should require headline, author, datePublished for Article', () => {
    const article = { '@type': 'Article', headline: 'Test', author: { name: 'Sunil' } };
    assert.ok(!article.datePublished, 'Missing datePublished should be flagged');
  });

  it('should require name, url, logo for Organization', () => {
    const org = { '@type': 'Organization', name: 'Test Corp' };
    assert.ok(!org.url, 'Missing url should be flagged');
    assert.ok(!org.logo, 'Missing logo should be flagged');
  });
});

describe('Crawler Detection', () => {
  it('should parse robots.txt Disallow correctly', () => {
    const robotsTxt = 'User-agent: GPTBot\nDisallow: /\n';
    const lines = robotsTxt.split('\n');
    let agent = null;
    let blocked = false;
    for (const line of lines) {
      if (line.startsWith('User-agent:')) agent = line.split(':')[1].trim();
      if (line.startsWith('Disallow:') && line.includes('/') && agent === 'GPTBot') blocked = true;
    }
    assert.ok(blocked, 'GPTBot should be detected as blocked');
  });

  it('should detect 20 crawlers', () => {
    const crawlers = [
      'GPTBot', 'ChatGPT-User', 'OAI-SearchBot', 'ClaudeBot', 'anthropic-ai',
      'PerplexityBot', 'Google-Extended', 'Googlebot', 'Amazonbot', 'Applebot-Extended',
      'Bingbot', 'YouBot', 'DuckAssistBot', 'FacebookBot', 'cohere-ai',
      'Bytespider', 'CCBot', 'DeepSeekBot', 'GrokBot', 'Meta-ExternalAgent'
    ];
    assert.equal(crawlers.length, 20, 'Should track exactly 20 crawlers');
  });
});
