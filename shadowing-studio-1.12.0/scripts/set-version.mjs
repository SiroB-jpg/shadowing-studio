#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version || '')) {
  console.error('Usage: node scripts/set-version.mjs <major.minor.patch>');
  process.exit(2);
}

const dashed = version.replaceAll('.', '-');
const files = {
  html: path.join(root, 'index.html'),
  js: path.join(root, 'app.js'),
  css: path.join(root, 'styles.css'),
  sw: path.join(root, 'sw.js'),
  package: path.join(root, 'package.json'),
  lock: path.join(root, 'package-lock.json')
};

function update(file, replacements) {
  let text = fs.readFileSync(file, 'utf8');
  for (const [pattern, replacement] of replacements) {
    if (!pattern.test(text)) throw new Error(`${path.basename(file)}: version marker not found`);
    text = text.replace(pattern, replacement);
  }
  fs.writeFileSync(file, text);
}

update(files.html, [
  [/<meta name="app-version" content="[^"]+">/, `<meta name="app-version" content="${version}">`],
  [/<title>Italian Shadowing Studio — v[^<]+<\/title>/, `<title>Italian Shadowing Studio — v${version}</title>`],
  [/(<p class="header-sub">)v\d+\.\d+\.\d+/, `$1v${version}`]
]);
update(files.js, [[/VERSION:"\d+\.\d+\.\d+"/, `VERSION:"${version}"`]]);
update(files.css, [[/--css-version:"\d+\.\d+\.\d+"/, `--css-version:"${version}"`]]);
update(files.sw, [[/italian-shadowing-studio-v\d+-\d+-\d+/, `italian-shadowing-studio-v${dashed}`]]);
update(files.package, [[/"version": "\d+\.\d+\.\d+"/, `"version": "${version}"`]]);
const lock=JSON.parse(fs.readFileSync(files.lock,'utf8'));
lock.version=version;
if(lock.packages?.[''])lock.packages[''].version=version;
fs.writeFileSync(files.lock,JSON.stringify(lock,null,2)+'\n');

console.log(`Updated release markers to ${version}.`);
