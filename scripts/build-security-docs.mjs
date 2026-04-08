#!/usr/bin/env node
/**
 * build-security-docs.mjs
 * -----------------------------------------------------------------------------
 * Render the markdown documents in docs/security/ as branded HTML files in
 * docs/security/dist/, using the Ascentra brand stylesheet and HTML template.
 *
 * Each generated file can be opened directly in a browser and printed to
 * PDF (Ctrl+P → Destination: Save as PDF) for delivery to a customer.
 *
 * Run via:
 *   npm run docs:build
 *
 * Source markdown lives in docs/security/. The script ignores files inside
 * docs/security/template/ and docs/security/dist/.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { marked } from 'marked'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')
const SRC_DIR = path.join(ROOT, 'docs', 'security')
const TEMPLATE_DIR = path.join(SRC_DIR, 'template')
const DIST_DIR = path.join(SRC_DIR, 'dist')
const TEMPLATE_FILE = path.join(TEMPLATE_DIR, 'document.html')

// ────────────────────────────────────────────────────────────────────────────
// Per-document metadata. Edit this when a new document is added or when the
// version / classification changes for an existing one. Keys must match the
// markdown filename (without the .md extension).
// ────────────────────────────────────────────────────────────────────────────

const DOC_METADATA = {
  'AstraPlanner-Security-AVG-Protest-Sportwear': {
    eyebrow: 'Informatiebeveiliging en AVG-verwerkingsdocument',
    title: 'Astra — Informatiebeveiliging en gegevensbescherming',
    subtitle: 'Beschrijving van de technische en organisatorische maatregelen rondom het Astra-platform, opgesteld ten behoeve van due-diligence door Protest Sportwear B.V.',
    recipient: 'Protest Sportwear B.V., t.a.v. Dhr. M. Werkman',
    version: '1.1',
    date: '9 april 2026',
    classification: 'Vertrouwelijk',
  },
  'Concept-Verwerkersovereenkomst': {
    eyebrow: 'Verwerkersovereenkomst — artikel 28 AVG',
    title: 'Concept Verwerkersovereenkomst',
    subtitle: 'Vastlegging van de verwerker-verwerkingsverantwoordelijke verhouding tussen Ascentra B.V. en Protest Sportwear B.V., conform artikel 28 van de Algemene Verordening Gegevensbescherming.',
    recipient: 'Protest Sportwear B.V.',
    version: '0.1 (concept)',
    date: '9 april 2026',
    classification: 'Concept ten behoeve van juridische review',
  },
  'Concept-Security-Addendum': {
    eyebrow: 'Bijlage bij de Verwerkersovereenkomst',
    title: 'Concept Security Addendum',
    subtitle: 'Contractuele vastlegging van de technische en organisatorische beveiligingsmaatregelen, met een opschortings- en opzeggingsrecht voor de Verwerkingsverantwoordelijke bij structurele niet-naleving.',
    recipient: 'Protest Sportwear B.V.',
    version: '0.1 (concept)',
    date: '9 april 2026',
    classification: 'Concept ten behoeve van juridische review',
  },
  'DPIA-Template': {
    eyebrow: 'Data Protection Impact Assessment',
    title: 'DPIA-template voor Astra',
    subtitle: 'Hergebruikbaar template waarmee een verwerkingsverantwoordelijke de DPIA-verplichting onder artikel 35 AVG kan invullen voor de implementatie van het Astra-platform.',
    recipient: 'Verwerkingsverantwoordelijken die het Astra-platform inzetten',
    version: '1.0',
    date: '9 april 2026',
    classification: 'Hulpmiddel ter beschikking gesteld door Ascentra',
  },
  'ai-prompt-injection-test-catalog': {
    eyebrow: 'Adversarial testcatalogus',
    title: 'AI Prompt Injection — testcatalogus',
    subtitle: 'Catalogus van adversarial prompts voor periodieke handmatige verificatie van de AI-laag van het Astra-platform.',
    recipient: 'Ascentra B.V. — security team',
    version: '1.0',
    date: '9 april 2026',
    classification: 'Intern',
  },
}

// ────────────────────────────────────────────────────────────────────────────
// Marked configuration: GitHub-flavoured markdown, smart quotes, no
// raw HTML escaping (we trust our own source markdown).
// ────────────────────────────────────────────────────────────────────────────

marked.setOptions({
  gfm: true,
  breaks: false,
  pedantic: false,
})

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function fillTemplate(template, replacements) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = replacements[key]
    if (value === undefined) {
      console.warn(`[build-docs] missing placeholder: ${key}`)
      return ''
    }
    return value
  })
}

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// ────────────────────────────────────────────────────────────────────────────
// Build pipeline
// ────────────────────────────────────────────────────────────────────────────

function buildAll() {
  ensureDir(DIST_DIR)

  // Copy the brand stylesheet into dist/template so the relative href in
  // each output file resolves correctly when opened from docs/security/dist/.
  ensureDir(path.join(DIST_DIR, '..', 'template'))

  const template = readFileSync(TEMPLATE_FILE, 'utf8')

  const sourceFiles = readdirSync(SRC_DIR)
    .filter((f) => f.endsWith('.md'))
    .filter((f) => !f.startsWith('.'))

  let built = 0
  let skipped = 0

  for (const file of sourceFiles) {
    const baseName = file.replace(/\.md$/, '')
    const meta = DOC_METADATA[baseName]
    if (!meta) {
      console.warn(`[build-docs] no metadata for ${file} — skipping`)
      skipped++
      continue
    }

    const markdownPath = path.join(SRC_DIR, file)
    const markdown = readFileSync(markdownPath, 'utf8')

    // Strip the first H1 from the markdown body — the cover page already
    // shows the title, so we don't want to repeat it inside the article.
    const bodyMarkdown = markdown.replace(/^#\s+.+\n+/m, '')
    const html = marked.parse(bodyMarkdown)

    const filled = fillTemplate(template, {
      EYEBROW: escapeHtml(meta.eyebrow),
      TITLE: escapeHtml(meta.title),
      SUBTITLE: escapeHtml(meta.subtitle),
      RECIPIENT: escapeHtml(meta.recipient),
      VERSION: escapeHtml(meta.version),
      DATE: escapeHtml(meta.date),
      CLASSIFICATION: escapeHtml(meta.classification),
      CONTENT: html,
    })

    const outPath = path.join(DIST_DIR, `${baseName}.html`)
    writeFileSync(outPath, filled, 'utf8')
    built++
    console.log(`[build-docs] ✓ ${baseName}.html`)
  }

  // Also create a tiny index.html in dist/ that links to all generated docs,
  // so the user can navigate to the whole pack from one entry point.
  const indexLinks = sourceFiles
    .filter((f) => DOC_METADATA[f.replace(/\.md$/, '')])
    .map((f) => {
      const baseName = f.replace(/\.md$/, '')
      const meta = DOC_METADATA[baseName]
      return `      <li><a href="./${baseName}.html"><strong>${escapeHtml(meta.title)}</strong><br /><span>${escapeHtml(meta.subtitle)}</span></a></li>`
    })
    .join('\n')

  const indexHtml = `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8" />
  <title>Ascentra — Security &amp; Compliance documenten</title>
  <link rel="stylesheet" href="../template/ascentra-brand.css" />
  <style>
    .index-list { list-style: none; padding: 0; margin: 32px 0 0; }
    .index-list li { margin-bottom: 18px; }
    .index-list a {
      display: block;
      padding: 18px 22px;
      background: var(--ascentra-cream);
      border: 1px solid var(--ascentra-hairline);
      border-left: 3px solid var(--ascentra-navy);
      text-decoration: none;
      color: var(--ascentra-ink);
      transition: background 120ms ease;
    }
    .index-list a:hover { background: var(--ascentra-cream-warm); }
    .index-list strong { color: var(--ascentra-navy); font-size: 14pt; }
    .index-list span { color: var(--ascentra-muted); font-size: 10pt; }
  </style>
</head>
<body>
  <main class="page">
    <header class="cover">
      <div class="cover-inner">
        <div class="cover-mark">
          <div class="cover-logo">A</div>
          <div class="cover-wordmark">ASCENTRA</div>
        </div>
        <div class="cover-eyebrow">Documentenpakket</div>
        <h1 class="cover-title">Security &amp; Compliance</h1>
        <p class="cover-subtitle">Het volledige pakket van technische, juridische en organisatorische documenten rondom het Astra-platform.</p>
        <p class="cover-tagline">Operational excellence, engineered with intelligence.</p>
      </div>
    </header>

    <article class="content">
      <h2>Inhoud</h2>
      <ul class="index-list">
${indexLinks}
      </ul>
    </article>

    <footer class="doc-footer">
      <div class="doc-footer-brand">
        <div class="doc-footer-mark">A</div>
        <div>
          <strong>Ascentra B.V.</strong><br />
          Oranjestraat 11, 9401 KE Assen — KvK 98227548
        </div>
      </div>
      <div class="doc-footer-meta">Documentenpakket<br />Gegenereerd via build-security-docs.mjs</div>
    </footer>
  </main>
</body>
</html>
`
  writeFileSync(path.join(DIST_DIR, 'index.html'), indexHtml, 'utf8')

  console.log(`[build-docs] built ${built} document(s), skipped ${skipped}`)
  console.log(`[build-docs] open docs/security/dist/index.html in a browser to review`)
}

buildAll()
