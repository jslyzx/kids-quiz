#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

function usage() {
  console.log('Usage: pnpm pdf:extract-images -- <paper.pdf> <output-dir>');
}

function parseArgs(argv) {
  const [pdf, outDir] = argv;
  if (!pdf || !outDir || pdf === '--help' || pdf === '-h') {
    usage();
    process.exit(pdf ? 0 : 1);
  }
  return { pdf: resolve(process.cwd(), pdf), outDir: resolve(process.cwd(), outDir) };
}

function findDictionaryStart(buffer, streamIndex) {
  const start = buffer.lastIndexOf(Buffer.from('<<'), streamIndex);
  return start >= 0 ? start : 0;
}

function readStreamBytes(buffer, streamIndex) {
  let start = streamIndex + 'stream'.length;
  if (buffer[start] === 0x0d && buffer[start + 1] === 0x0a) start += 2;
  else if (buffer[start] === 0x0a || buffer[start] === 0x0d) start += 1;
  const end = buffer.indexOf(Buffer.from('endstream'), start);
  if (end < 0) return null;
  let actualEnd = end;
  while (actualEnd > start && (buffer[actualEnd - 1] === 0x0a || buffer[actualEnd - 1] === 0x0d)) actualEnd -= 1;
  return buffer.subarray(start, actualEnd);
}

function main() {
  const { pdf, outDir } = parseArgs(process.argv.slice(2));
  const buffer = readFileSync(pdf);
  mkdirSync(outDir, { recursive: true });

  const streamToken = Buffer.from('stream');
  let cursor = 0;
  let count = 0;

  while (true) {
    const streamIndex = buffer.indexOf(streamToken, cursor);
    if (streamIndex < 0) break;
    cursor = streamIndex + streamToken.length;
    const dictStart = findDictionaryStart(buffer, streamIndex);
    const dictText = buffer.subarray(dictStart, streamIndex).toString('latin1');
    if (!/\/Subtype\s*\/Image/.test(dictText)) continue;

    const bytes = readStreamBytes(buffer, streamIndex);
    if (!bytes?.length) continue;

    let ext = 'bin';
    if (/\/DCTDecode/.test(dictText)) ext = 'jpg';
    else if (/\/JPXDecode/.test(dictText)) ext = 'jp2';
    else if (/\/FlateDecode/.test(dictText)) ext = 'flate';

    count += 1;
    const output = resolve(outDir, `${basename(pdf).replace(/\.[^.]+$/, '')}_img_${count}.${ext}`);
    writeFileSync(output, bytes);
    console.log(output);
  }

  console.log(`Extracted ${count} image stream(s).`);
  if (!count) process.exitCode = 2;
}

main();
