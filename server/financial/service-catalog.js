import { createHash } from 'node:crypto';
import { ekoBbpsProvider } from './eko-bbps-provider.js';

function providerRows(payload) {
  if (!Array.isArray(payload?.data)) throw new Error('EKO_INVALID_PROVIDER_CATALOG');
  return payload.data;
}

function safeCategory(row) {
  const id = row.operator_category_id ?? row.category_id ?? row.id;
  const name = row.operator_category_name ?? row.category_name ?? row.name;
  if (id === undefined || !String(name || '').trim()) throw new Error('EKO_INVALID_CATEGORY_ROW');
  return { id: String(id), name: String(name).trim().slice(0, 120), active: row.status === undefined || Number(row.status) === 1 };
}

function safeBiller(row, categoryId) {
  if (row.operator_id === undefined || !String(row.name || '').trim()) throw new Error('EKO_INVALID_BILLER_ROW');
  return {
    id: String(row.operator_id), name: String(row.name).trim().slice(0, 180), categoryId,
    supportsBillFetch: Number(row.billFetchResponse ?? row.fetchBill ?? 0) === 1,
    highCommission: Number(row.high_commission_channel || 0) === 1,
    bbpsMember: Number(row.BBPS || row.bbps || 0) === 1,
  };
}

function safeParameters(payload) {
  const rows = providerRows(payload);
  const fields = rows.map((row) => {
    if (row.param_name == null || row.param_label == null || row.param_type == null) throw new Error('EKO_INVALID_BILLER_PARAMETER');
    return {
      id: String(row.param_id ?? row.param_name), name: String(row.param_name).slice(0, 96),
      label: String(row.param_label).slice(0, 180), type: String(row.param_type).slice(0, 32),
      regex: typeof row.regex === 'string' ? row.regex.slice(0, 512) : null,
      error: typeof row.error_message === 'string' ? row.error_message.slice(0, 256) : null,
      required: row.is_required === undefined ? true : Boolean(Number(row.is_required)),
      values: Array.isArray(row.list_values) ? row.list_values : null,
    };
  });
  return { fields, requiresBillFetch: Number(payload.fetchBill) === 1, bbpsMember: Number(payload.BBPS) === 1 };
}

function stableHash(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

async function saveVersion(db, catalogName, content) {
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`eko:${catalogName}`]);
  const hash = stableHash(content);
  const found = await db.query(`SELECT id,version_number,synced_at FROM financial_service_catalog_versions
    WHERE provider='eko' AND catalog_name=$1 AND content_sha256=$2`, [catalogName, hash]);
  if (found.rows[0]) {
    const refreshed = await db.query(`UPDATE financial_service_catalog_versions SET synced_at=now() WHERE id=$1 RETURNING id,version_number,synced_at`, [found.rows[0].id]);
    return refreshed.rows[0];
  }
  const max = await db.query(`SELECT COALESCE(MAX(version_number),0)::int AS version_number FROM financial_service_catalog_versions
    WHERE provider='eko' AND catalog_name=$1`, [catalogName]);
  const saved = await db.query(`INSERT INTO financial_service_catalog_versions(provider,catalog_name,version_number,content_sha256,content)
    VALUES('eko',$1,$2,$3,$4::jsonb) RETURNING id,version_number,synced_at`, [catalogName, max.rows[0].version_number + 1, hash, JSON.stringify(content)]);
  return saved.rows[0];
}

export async function syncEkoCategories(db) {
  if (!ekoBbpsProvider.isCatalogConfigured()) throw new Error('EKO_CATALOG_UNAVAILABLE');
  const rows = providerRows(await ekoBbpsProvider.getCategories()).map(safeCategory);
  await db.query('BEGIN');
  try {
    const version = await saveVersion(db, 'categories', rows);
    const ids = rows.map((row) => row.id);
    if (ids.length) await db.query(`UPDATE financial_service_categories SET active=false,updated_at=now() WHERE provider='eko' AND NOT(provider_category_id=ANY($1::text[]))`, [ids]);
    else await db.query(`UPDATE financial_service_categories SET active=false,updated_at=now() WHERE provider='eko'`);
    for (const row of rows) await db.query(`INSERT INTO financial_service_categories(provider,provider_category_id,name,active,catalog_version_id)
      VALUES('eko',$1,$2,$3,$4) ON CONFLICT(provider,provider_category_id) DO UPDATE SET
      name=EXCLUDED.name,active=EXCLUDED.active,catalog_version_id=EXCLUDED.catalog_version_id,updated_at=now()`, [row.id,row.name,row.active,version.id]);
    await db.query('COMMIT');
    return { count: rows.length, version: version.version_number, syncedAt: version.synced_at };
  } catch (error) { await db.query('ROLLBACK').catch(() => {}); throw error; }
}

export async function syncEkoBillers(db, categoryId) {
  if (!ekoBbpsProvider.isCatalogConfigured()) throw new Error('EKO_CATALOG_UNAVAILABLE');
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(categoryId)) throw new Error('INVALID_SERVICE_CATEGORY');
  const { rows: categoryRows } = await db.query(`SELECT provider_category_id FROM financial_service_categories
    WHERE provider='eko' AND provider_category_id=$1 AND active=true`, [categoryId]);
  if (!categoryRows.length) throw new Error('SERVICE_CATEGORY_NOT_FOUND');
  const billers = providerRows(await ekoBbpsProvider.getBillers({ category: categoryId })).map((row) => safeBiller(row, categoryId));
  await db.query('BEGIN');
  try {
    const version = await saveVersion(db, `billers:${categoryId}`, billers);
    const ids = billers.map((row) => row.id);
    if (ids.length) await db.query(`UPDATE financial_service_billers SET active=false,updated_at=now()
      WHERE provider='eko' AND category_id=$1 AND NOT(provider_biller_id=ANY($2::text[]))`, [categoryId,ids]);
    else await db.query(`UPDATE financial_service_billers SET active=false,updated_at=now() WHERE provider='eko' AND category_id=$1`, [categoryId]);
    for (const row of billers) await db.query(`INSERT INTO financial_service_billers(provider,provider_biller_id,category_id,name,supports_bill_fetch,high_commission_channel,active,bbps_member,catalog_version_id)
      VALUES('eko',$1,$2,$3,$4,$5,true,$6,$7) ON CONFLICT(provider,provider_biller_id) DO UPDATE SET
      category_id=EXCLUDED.category_id,name=EXCLUDED.name,supports_bill_fetch=EXCLUDED.supports_bill_fetch,
      high_commission_channel=EXCLUDED.high_commission_channel,active=true,bbps_member=EXCLUDED.bbps_member,
      catalog_version_id=EXCLUDED.catalog_version_id,updated_at=now()`, [row.id,row.categoryId,row.name,row.supportsBillFetch,row.highCommission,row.bbpsMember,version.id]);
    await db.query('COMMIT');
    return { count: billers.length, version: version.version_number, syncedAt: version.synced_at };
  } catch (error) { await db.query('ROLLBACK').catch(() => {}); throw error; }
}

export async function syncEkoBillerParameters(db, billerId) {
  if (!ekoBbpsProvider.isCatalogConfigured()) throw new Error('EKO_CATALOG_UNAVAILABLE');
  if (!/^\d{1,12}$/.test(String(billerId))) throw new Error('INVALID_PROVIDER_BILLER_ID');
  const { rows: billers } = await db.query(`SELECT provider_biller_id FROM financial_service_billers
    WHERE provider='eko' AND provider_biller_id=$1 AND active=true`, [billerId]);
  if (!billers.length) throw new Error('BILLER_NOT_FOUND');
  const catalog = safeParameters(await ekoBbpsProvider.getBillerParameters(billerId));
  await db.query('BEGIN');
  try {
    const version = await saveVersion(db, `parameters:${billerId}`, catalog);
    await db.query(`DELETE FROM financial_service_biller_parameters WHERE provider='eko' AND provider_biller_id=$1`, [billerId]);
    for (const field of catalog.fields) await db.query(`INSERT INTO financial_service_biller_parameters
      (provider,provider_biller_id,parameter_id,parameter_name,parameter_label,parameter_type,validation_regex,error_message,list_values,required,catalog_version_id)
      VALUES('eko',$1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)`, [billerId,field.id,field.name,field.label,field.type,field.regex,field.error,field.values ? JSON.stringify(field.values) : null,field.required,version.id]);
    await db.query(`UPDATE financial_service_billers SET supports_bill_fetch=$2,bbps_member=$3,catalog_version_id=$4,updated_at=now()
      WHERE provider='eko' AND provider_biller_id=$1`, [billerId,catalog.requiresBillFetch,catalog.bbpsMember,version.id]);
    await db.query('COMMIT');
    return { parameters: catalog.fields, requiresBillFetch: catalog.requiresBillFetch, bbpsMember: catalog.bbpsMember, version: version.version_number };
  } catch (error) { await db.query('ROLLBACK').catch(() => {}); throw error; }
}

export function serviceCatalogError(error) {
  if (error.message === 'EKO_CATALOG_UNAVAILABLE') return { status: 503, body: { error: error.message, status: 'SERVICE_ACTIVATION_PENDING' } };
  if (error.message === 'SERVICE_CATEGORY_NOT_FOUND' || error.message === 'BILLER_NOT_FOUND') return { status: 404, body: { error: error.message } };
  if (error.message.startsWith('INVALID_')) return { status: 400, body: { error: error.message } };
  return { status: 503, body: { error: 'SERVICE_CATALOG_UNAVAILABLE' } };
}
