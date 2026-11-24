import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyFileAttachment,
  formatFileSize,
  prepareMarkdownForSignTranslation,
} from './attachments.ts';

test('classifyFileAttachment identifies image, pdf, and code/text documents accurately', () => {
  assert.equal(classifyFileAttachment('photo.jpg', 'image/jpeg'), 'image');
  assert.equal(classifyFileAttachment('scan.webp', ''), 'image');
  assert.equal(classifyFileAttachment('manual.pdf', 'application/pdf'), 'pdf');
  assert.equal(classifyFileAttachment('esp32_sketch.ino', ''), 'text');
  assert.equal(classifyFileAttachment('data.csv', 'text/csv'), 'text');
  assert.equal(classifyFileAttachment('notes.md', 'text/markdown'), 'text');
  assert.equal(classifyFileAttachment('archive.zip', 'application/zip'), null);
});

test('formatFileSize renders human-readable units', () => {
  assert.equal(formatFileSize(512), '512 B');
  assert.equal(formatFileSize(2048), '2.0 KB');
  assert.equal(formatFileSize(2 * 1024 * 1024), '2.0 MB');
});

test('prepareMarkdownForSignTranslation strips fenced code blocks and markdown syntax cleanly', () => {
  const md = `## العنوان الرئيسي\n**مرحباً** بك في [الموقع](https://example.com)\n\`\`\`cpp\nvoid setup() {}\n\`\`\`\nوالنتيجة جاهزة.`;
  const clean = prepareMarkdownForSignTranslation(md);
  assert.ok(!clean.includes('```'));
  assert.ok(!clean.includes('https://'));
  assert.ok(clean.includes('مرحباً'));
  assert.ok(clean.includes('والنتيجة جاهزة.'));
});
