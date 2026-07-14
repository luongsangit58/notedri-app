#!/usr/bin/env node
/**
 * Sinh snapshot Rule Engine cho app từ nguồn duy nhất bên repo Laravel.
 * KHÔNG BAO GIỜ sửa tay file src/data/diagnosticRules.json - chạy lại script này.
 * Snapshot này CHỈ dùng làm fallback offline (dtcOfflineDictionary pattern) -
 * lúc chạy thật app tải bản mới nhất qua GET /api/v1/diagnostic-rules.
 *
 * Chạy: npm run sync:rules   (yêu cầu repo notedri nằm cạnh notedri-app)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(root, '..', 'notedri', 'resources', 'data', 'diagnostic_rules.json');
const TARGET = join(root, 'src', 'data', 'diagnosticRules.json');

const raw = readFileSync(SOURCE, 'utf8');
const parsed = JSON.parse(raw);
const hash = createHash('sha256').update(raw).digest('hex').slice(0, 12);

mkdirSync(dirname(TARGET), { recursive: true });
writeFileSync(
  TARGET,
  JSON.stringify(
    {
      _generated: 'sync-diagnostic-rules.mjs - DO NOT EDIT BY HAND (offline fallback only)',
      source_hash: hash,
      synced_at: new Date().toISOString(),
      version: parsed.version,
      rules: parsed.rules,
    },
    null,
    1,
  ) + '\n',
);

console.log(`OK: ${parsed.rules.length} rules -> src/data/diagnosticRules.json (source ${hash})`);
