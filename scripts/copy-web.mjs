// Copies the single-file app into dist/index.html for the desktop build.
// glassnote.html stays the only source of truth — never edit dist/ by hand.
import { mkdirSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(path.join(root, 'dist'), { recursive: true });
copyFileSync(path.join(root, 'glassnote.html'), path.join(root, 'dist', 'index.html'));
mkdirSync(path.join(root, 'dist', 'vendor'), { recursive: true });
copyFileSync(path.join(root, 'vendor', 'pdfjs.js'), path.join(root, 'dist', 'vendor', 'pdfjs.js'));
console.log('copied glassnote.html + vendor/ -> dist/');
