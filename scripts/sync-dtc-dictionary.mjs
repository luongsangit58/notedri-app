#!/usr/bin/env node
/**
 * Sinh snapshot từ điển DTC cho app từ nguồn duy nhất bên repo Laravel.
 * KHÔNG BAO GIỜ sửa tay file src/data/dtcDictionary.json - chạy lại script này.
 * (R4 trong knowledge-engine-architecture-review: 1 nguồn, bản sao được SINH, không drift.)
 *
 * Chạy: npm run sync:dtc   (yêu cầu repo notedri nằm cạnh notedri-app)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(root, '..', 'notedri', 'resources', 'data', 'dtc_dictionary.json');
const TARGET = join(root, 'src', 'data', 'dtcDictionary.json');

const raw = readFileSync(SOURCE, 'utf8');
const entries = JSON.parse(raw);
const hash = createHash('sha256').update(raw).digest('hex').slice(0, 12);

mkdirSync(dirname(TARGET), { recursive: true });
writeFileSync(
  TARGET,
  JSON.stringify(
    {
      _generated: 'sync-dtc-dictionary.mjs - DO NOT EDIT BY HAND',
      source_hash: hash,
      synced_at: new Date().toISOString(),
      count: entries.length,
      entries,
    },
    null,
    1,
  ) + '\n',
);

console.log(`OK: ${entries.length} codes -> src/data/dtcDictionary.json (source ${hash})`);
