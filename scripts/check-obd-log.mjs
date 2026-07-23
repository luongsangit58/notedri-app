#!/usr/bin/env node
/**
 * Rà soát file log phiên OBD2 (obd-fixtures/*.json) tìm bất thường:
 * timestamp lùi/nhảy lộn xộn, khoảng trống kết nối lớn, lệnh PID bị gửi
 * trùng dồn dập, lỗi CAN/NO DATA/TIMEOUT, và permission keepalive bị từ chối.
 *
 * Chạy: npm run check:obd-log -- obd-fixtures/notedri-obd-session.json
 * Không truyền path: quét toàn bộ *.json trong obd-fixtures/.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES_DIR = join(root, 'obd-fixtures');

const GAP_WARN_MS = 5000;
const BURST_WINDOW_MS = 150;
const ERROR_RESPONSES = ['CAN ERROR', 'NO DATA', 'TIMEOUT', 'BUS INIT', 'UNABLE TO CONNECT'];

function checkSession(filePath) {
  const raw = readFileSync(filePath, 'utf8');
  const { entries = [] } = JSON.parse(raw);
  const issues = [];

  let prevReal = null;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (typeof e.cmd === 'string' && e.cmd.startsWith('#')) continue;

    if (prevReal !== null) {
      const delta = e.t - prevReal.t;
      if (delta < 0) {
        issues.push(`[timestamp lùi] dòng ${i + 1}: t=${e.t} < t trước đó=${prevReal.t} (lùi ${-delta}ms), cmd=${e.cmd}`);
      } else if (delta > GAP_WARN_MS) {
        issues.push(`[gap lớn] dòng ${i + 1}: khoảng trống ${delta}ms giữa "${prevReal.cmd}"(t=${prevReal.t}) và "${e.cmd}"(t=${e.t}) không có #device/reconnect`);
      }
    }
    prevReal = e;
  }

  const pending = new Map();
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (typeof e.cmd !== 'string' || e.cmd.startsWith('#')) continue;
    const last = pending.get(e.cmd);
    if (last !== undefined && e.t - last >= 0 && e.t - last <= BURST_WINDOW_MS) {
      issues.push(`[lệnh trùng dồn dập] dòng ${i + 1}: "${e.cmd}" gửi lại sau chỉ ${e.t - last}ms (t=${e.t})`);
    }
    pending.set(e.cmd, e.t);
  }

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const res = String(e.res ?? '');
    if (ERROR_RESPONSES.some((code) => res.includes(code)) || res.startsWith('<<')) {
      issues.push(`[phản hồi lỗi] dòng ${i + 1}: "${e.cmd}" -> "${res}" (t=${e.t})`);
    }
  }

  const keepaliveEvents = entries.filter((e) => e.cmd === '#keepalive');
  const deniedFirst = keepaliveEvents.findIndex((e) => e.res === 'skipped_no_permission');
  if (deniedFirst !== -1) {
    const startedAfter = keepaliveEvents.find((e, idx) => idx > deniedFirst && e.res === 'started');
    issues.push(
      startedAfter
        ? `[keepalive trễ] bị từ chối quyền lúc t=${keepaliveEvents[deniedFirst].t}, mãi t=${startedAfter.t} mới "started" (chậm ${startedAfter.t - keepaliveEvents[deniedFirst].t}ms)`
        : `[keepalive bị chặn] "skipped_no_permission" lúc t=${keepaliveEvents[deniedFirst].t} và không thấy "started" sau đó`,
    );
  }

  return issues;
}

function main() {
  const arg = process.argv[2];
  const files = arg
    ? [arg]
    : readdirSync(FIXTURES_DIR)
        .filter((f) => f.endsWith('.json'))
        .map((f) => join(FIXTURES_DIR, f));

  let totalIssues = 0;
  for (const file of files) {
    const issues = checkSession(file);
    totalIssues += issues.length;
    console.log(`\n=== ${basename(file)} ===`);
    if (issues.length === 0) {
      console.log('OK: không phát hiện bất thường.');
      continue;
    }
    for (const issue of issues) console.log(`- ${issue}`);
  }

  console.log(`\nTổng: ${totalIssues} bất thường trong ${files.length} file.`);
  process.exitCode = totalIssues > 0 ? 1 : 0;
}

main();
