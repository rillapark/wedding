import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { get, put, BlobPreconditionFailedError } from '@vercel/blob';
import * as XLSX from 'xlsx';

// Preview and development deployments share this Blob store but are built from
// other commits, so they ship their own roster file. Keep them off the real plan.
const ENV = process.env.VERCEL_ENV || 'development';
const BLOB_PATH = ENV === 'production' ? 'plan.json' : `plan-${ENV}.json`;
const MAX_BODY = 4 * 1024 * 1024;

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

const emptyTables = () =>
  Array.from({ length: 20 }, () => ({ capacity: 10, seats: Array(10).fill(null) }));

// Mirrors dist/app.js parseWorkbook so the server reads the workbook the same
// way the page does.
function parseWorkbook(buffer) {
  const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' });
  const sheet = wb.Sheets['하객명단'] || wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  if (!rows.length) throw new Error('명단이 비어 있습니다.');
  const normalized = rows
    .map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.trim(), v])))
    .filter(r => String(r['이름'] ?? '').trim());
  if (!normalized.length) throw new Error('이름을 입력한 행이 없습니다.');
  if (normalized.length > 5000) throw new Error('하객 명단은 최대 5,000명까지 가능합니다.');

  const tables = emptyTables();
  if (wb.Sheets['테이블설정']) {
    for (const r of XLSX.utils.sheet_to_json(wb.Sheets['테이블설정'])) {
      const ti = Number(r['테이블']), cap = Number(r['좌석수']);
      if (Number.isInteger(ti) && ti >= 1 && ti <= 20 && [8, 9, 10].includes(cap)) tables[ti - 1].capacity = cap;
    }
  }
  const guests = normalized.map((r, i) => {
    const g = { id: i + 1, name: String(r['이름']).trim(), group: String(r['구분'] ?? '').trim() };
    const ti = Number(r['테이블']), si = Number(r['좌석']);
    if (Number.isInteger(ti) && ti >= 1 && ti <= 20 && Number.isInteger(si) && si >= 1 && si <= tables[ti - 1].capacity
        && tables[ti - 1].seats[si - 1] === null) {
      tables[ti - 1].seats[si - 1] = g.id;
    }
    return g;
  });
  return { guests, tables };
}

// The deployed workbook is the single source of truth for who is on the list.
const ROSTER_TTL_MS = 10_000;
let rosterCache = null, rosterCachedAt = 0;

// Prefer the copy bundled with the function (see vercel.json includeFiles);
// fetching the deployment over HTTP is a fallback and can hang, so it is bounded.
async function rosterBytes() {
  if (process.env.ROSTER_FILE) return await readFile(process.env.ROSTER_FILE);
  for (const candidate of ['dist/data/guests.xlsx', '../dist/data/guests.xlsx']) {
    try { return await readFile(path.resolve(process.cwd(), candidate)); } catch {}
  }
  const url = process.env.ROSTER_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}/data/guests.xlsx` : null);
  if (!url) throw new Error('명단 파일을 찾지 못했습니다.');
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error('명단 파일을 읽지 못했습니다.');
  return Buffer.from(await res.arrayBuffer());
}

async function loadRoster() {
  if (rosterCache && Date.now() - rosterCachedAt < ROSTER_TTL_MS) return rosterCache;
  const bytes = await rosterBytes();
  const hash = createHash('sha256').update(bytes).digest('hex');
  rosterCache = { ...parseWorkbook(bytes), hash };
  rosterCachedAt = Date.now();
  return rosterCache;
}

const identity = g => `${String(g.name || '').trim()}\u0000${String(g.group || '').trim()}`;

// Keep the seats, swap the guest list. Anyone still on the new roster stays put.
function reseat(plan, roster) {
  const previousById = new Map((plan?.guests || []).map(g => [g.id, g]));
  const byIdentity = new Map();
  for (const g of roster.guests) if (!byIdentity.has(identity(g))) byIdentity.set(identity(g), g);

  const tables = roster.tables.map((t, ti) => {
    const prev = plan?.tables?.[ti];
    const capacity = prev && [8, 9, 10].includes(prev.capacity)
      && !t.seats.slice(prev.capacity).some(x => x !== null) ? prev.capacity : t.capacity;
    return { capacity, seats: t.seats.slice() };
  });
  const used = new Set(tables.flatMap(t => t.seats).filter(x => x !== null));

  (plan?.tables || []).forEach((t, ti) => (t.seats || []).forEach((id, si) => {
    if (id === null || !tables[ti]) return;
    const previous = previousById.get(id);
    const match = previous && byIdentity.get(identity(previous));
    if (!match || used.has(match.id) || si >= tables[ti].capacity || tables[ti].seats[si] !== null) return;
    tables[ti].seats[si] = match.id;
    used.add(match.id);
  }));
  return { guests: roster.guests, tables, rosterHash: roster.hash };
}

function validate(plan, roster) {
  if (!plan || typeof plan !== 'object') throw new Error('배치 형식이 올바르지 않습니다.');
  const { guests, tables } = plan;
  if (!Array.isArray(guests) || !guests.length || guests.length > 5000) throw new Error('하객 명단이 올바르지 않습니다.');
  if (!Array.isArray(tables) || tables.length !== 20) throw new Error('테이블은 20개여야 합니다.');
  const ids = new Set();
  const cleanGuests = guests.map(g => {
    if (!g || !Number.isInteger(g.id) || ids.has(g.id)) throw new Error('하객 번호가 중복되었거나 올바르지 않습니다.');
    if (typeof g.name !== 'string' || !g.name.trim()) throw new Error('하객 이름이 비어 있습니다.');
    if (typeof g.group !== 'string') throw new Error('하객 구분이 올바르지 않습니다.');
    ids.add(g.id);
    return { id: g.id, name: g.name, group: g.group };
  });
  const used = new Set();
  const cleanTables = tables.map(t => {
    if (!t || ![8, 9, 10].includes(t.capacity)) throw new Error('좌석 수는 8~10석이어야 합니다.');
    if (!Array.isArray(t.seats) || t.seats.length !== 10) throw new Error('좌석 배열이 올바르지 않습니다.');
    return {
      capacity: t.capacity,
      seats: t.seats.map((id, i) => {
        if (id === null) return null;
        if (i >= t.capacity || !ids.has(id) || used.has(id)) throw new Error('좌석 배정이 올바르지 않습니다.');
        used.add(id);
        return id;
      }),
    };
  });
  const rosterHash = roster ? roster.hash
    : (typeof plan.rosterHash === 'string' && plan.rosterHash.length <= 128 ? plan.rosterHash : null);
  return { guests: cleanGuests, tables: cleanTables, rosterHash };
}

async function readStored() {
  const found = await get(BLOB_PATH, { access: 'private', useCache: false });
  if (!found || found.statusCode !== 200) return { plan: null, etag: null };
  const text = await new Response(found.stream).text();
  return { plan: JSON.parse(text), etag: found.blob.etag };
}

async function write(plan, etag) {
  const options = { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' };
  if (etag) options.ifMatch = etag;
  const record = { ...plan, updatedAt: new Date().toISOString() };
  const saved = await put(BLOB_PATH, JSON.stringify(record), options);
  return { plan: record, etag: saved.etag };
}

// Never hand back a plan built from a workbook we no longer deploy.
async function current() {
  const stored = await readStored();
  let roster = null;
  try { roster = await loadRoster(); } catch { roster = null; }
  if (!roster) return stored;
  if (stored.plan && stored.plan.rosterHash === roster.hash) return stored;
  const fixed = reseat(stored.plan, roster);
  // Serve the corrected roster even when persisting it does not work, so a
  // failed write can never put the old guest list back in front of anyone.
  try { return await write(fixed, stored.etag); }
  catch { return { plan: fixed, etag: stored.etag }; }
}

async function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error('요청이 너무 큽니다.');
    chunks.push(chunk);
  }
  if (!chunks.length) throw new Error('본문이 비어 있습니다.');
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      // Reading is the path everyone depends on; degrade rather than fail.
      let state;
      try { state = await current(); }
      catch { state = await readStored().catch(() => ({ plan: null, etag: null })); }
      return send(res, 200, { ...state, requiresKey: Boolean(process.env.EDIT_KEY) });
    }

    if (req.method === 'PUT') {
      const required = process.env.EDIT_KEY;
      if (required && req.headers['x-edit-key'] !== required) {
        return send(res, 401, { error: '편집 암호가 올바르지 않습니다.' });
      }
      const body = await readBody(req);
      let roster = null;
      try { roster = await loadRoster(); } catch { roster = null; }

      // A client working from a different workbook may not overwrite the plan.
      if (roster ? body?.plan?.rosterHash !== roster.hash : typeof body?.plan?.rosterHash !== 'string') {
        const state = await current();
        return send(res, 409, { error: '명단이 바뀌었습니다. 최신 명단을 불러왔습니다.', ...state });
      }
      const plan = validate(body.plan, roster);
      const state = await current();
      if ((state.etag || null) !== (body.etag || null)) {
        return send(res, 409, { error: '다른 기기에서 먼저 저장되었습니다.', ...state });
      }
      return send(res, 200, await write(plan, state.etag));
    }

    res.setHeader('Allow', 'GET, PUT');
    return send(res, 405, { error: '지원하지 않는 요청입니다.' });
  } catch (error) {
    if (error instanceof BlobPreconditionFailedError) {
      const state = await current().catch(() => ({ plan: null, etag: null }));
      return send(res, 409, { error: '다른 기기에서 먼저 저장되었습니다.', ...state });
    }
    return send(res, 400, { error: error?.message || '요청을 처리하지 못했습니다.' });
  }
}
