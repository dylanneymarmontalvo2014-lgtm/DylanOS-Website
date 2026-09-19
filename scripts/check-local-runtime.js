#!/usr/bin/env node

/**
 * Audita el runtime para detectar recursos y llamadas de red automáticas.
 * Se permiten destinos externos en enlaces <a href>, el namespace SVG estándar
 * y el <loc> del sitemap; no se permiten recursos remotos ni APIs externas.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FILES = [
  'index.html',
  'server.js',
  'robots.txt',
  'sitemap.xml',
  ...collectFiles('scripts'),
  ...collectFiles('styles')
];
const REMOTE_URL = /https?:\/\/[^\s"'<>`]+/gi;
const NETWORK_CALL = /\b(?:fetch|XMLHttpRequest|WebSocket|https?\.request)\s*\(/gi;
const PROVIDER_REFERENCE = /(?:api\.github\.com|media\.base44\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|translate\.googleapis\.com)/gi;

function collectFiles(directory) {
  const absoluteDirectory = path.join(ROOT, directory);
  if (!fs.existsSync(absoluteDirectory)) return [];
  return fs.readdirSync(absoluteDirectory)
    .filter(name => /\.(?:html?|css|js|mjs|cjs|xml|txt)$/i.test(name))
    .filter(name => !/^(?:check-local-runtime|app)\.test\.js$/.test(name))
    .filter(name => name !== 'check-local-runtime.js')
    .map(name => path.join(directory, name));
}

function isAllowedUrl(line, url) {
  const urlStart = line.indexOf(url);
  const beforeUrl = line.slice(Math.max(0, urlStart - 40), urlStart);
  if (/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\b/i.test(url)) return true;
  return /(?:\bhref\s*=\s*["']|\bxmlns\s*=\s*["']|<loc>\s*|Sitemap:\s*)$/i.test(beforeUrl);
}

function findViolations(content) {
  const violations = [];
  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const networkCalls = [...line.matchAll(NETWORK_CALL)];
    const remoteUrls = [...line.matchAll(REMOTE_URL)];

    if (networkCalls.length > 0) {
      violations.push({
        line: lineNumber,
        value: remoteUrls[0]?.[0] || networkCalls[0][0].trim(),
        reason: 'llamada de red'
      });
    } else {
      for (const match of remoteUrls) {
        if (!isAllowedUrl(line, match[0])) {
          violations.push({ line: lineNumber, value: match[0], reason: 'recurso remoto' });
        }
      }
    }

    for (const match of line.matchAll(PROVIDER_REFERENCE)) {
      if (!violations.some(item => item.line === lineNumber && item.value === match[0])) {
        violations.push({ line: lineNumber, value: match[0], reason: 'proveedor externo' });
      }
    }
  });

  return violations;
}

function audit() {
  const findings = [];
  for (const relativeFile of FILES) {
    const filePath = path.join(ROOT, relativeFile);
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf8');
    for (const violation of findViolations(content)) {
      findings.push({ file: relativeFile, ...violation });
    }
  }
  return findings;
}

if (require.main === module) {
  const findings = audit();
  if (findings.length > 0) {
    console.error('Se encontraron dependencias automáticas externas:');
    for (const finding of findings) {
      console.error(`- ${finding.file}:${finding.line} ${finding.reason}: ${finding.value}`);
    }
    process.exitCode = 1;
  } else {
    console.log('No se encontraron dependencias automáticas externas.');
  }
}

module.exports = { findViolations, audit };
