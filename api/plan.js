import { get, put, BlobPreconditionFailedError } from '@vercel/blob';

const BLOB_PATH = 'plan.json';
const MAX_BODY = 4 * 1024 * 1024;

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

// Mirrors the client-side restore checks so a malformed or hostile payload can
// never become the shared plan every guest list loads.
function validate(plan) {
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
    const seats = t.seats.map((id, i) => {
      if (id === null) return null;
      if (i >= t.capacity || !ids.has(id) || used.has(id)) throw new Error('좌석 배정이 올바르지 않습니다.');
      used.add(id);
      return id;
    });
    return { capacity: t.capacity, seats };
  });
  return { guests: cleanGuests, tables: cleanTables };
}

async function readPlan() {
  const found = await get(BLOB_PATH, { access: 'private', useCache: false });
  if (!found || found.statusCode !== 200) return { plan: null, etag: null };
  const text = await new Response(found.stream).text();
  return { plan: JSON.parse(text), etag: found.blob.etag };
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
      const current = await readPlan();
      return send(res, 200, { ...current, requiresKey: Boolean(process.env.EDIT_KEY) });
    }

    if (req.method === 'PUT') {
      const required = process.env.EDIT_KEY;
      if (required && req.headers['x-edit-key'] !== required) {
        return send(res, 401, { error: '편집 암호가 올바르지 않습니다.' });
      }

      const body = await readBody(req);
      const plan = validate(body.plan);

      // Reject a write built on a stale read so a slower editor cannot silently
      // erase someone else's changes.
      const current = await readPlan();
      if ((current.etag || null) !== (body.etag || null)) {
        return send(res, 409, { error: '다른 기기에서 먼저 저장되었습니다.', ...current });
      }

      const options = {
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json',
      };
      if (current.etag) options.ifMatch = current.etag;

      const record = { ...plan, updatedAt: new Date().toISOString() };
      const saved = await put(BLOB_PATH, JSON.stringify(record), options);
      return send(res, 200, { plan: record, etag: saved.etag });
    }

    res.setHeader('Allow', 'GET, PUT');
    return send(res, 405, { error: '지원하지 않는 요청입니다.' });
  } catch (error) {
    if (error instanceof BlobPreconditionFailedError) {
      const current = await readPlan().catch(() => ({ plan: null, etag: null }));
      return send(res, 409, { error: '다른 기기에서 먼저 저장되었습니다.', ...current });
    }
    return send(res, 400, { error: error?.message || '요청을 처리하지 못했습니다.' });
  }
}
