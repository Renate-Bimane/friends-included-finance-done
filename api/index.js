import { createClient } from '@supabase/supabase-js';
import { JWT } from 'google-auth-library';

const PEOPLE = ['Richard', 'Anastasia', 'Jean-Claude'];
const ORDER = { Richard: 0, Anastasia: 1, 'Jean-Claude': 2 };
const sb = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const json = (res, code, body) => res.status(code).json(body);
const euros = n => Math.round(Number(n) * 100) / 100;
function splits(input) {
  return PEOPLE.reduce((a, n) => ({ ...a, [n]: Number(input?.[n] || 0) }), {});
}
function assertSale(x) {
  const total = PEOPLE.reduce((s, n) => s + x[n], 0);
  if (!['A', 'B'].includes(x.project) || !x.customer || Math.abs(total - 100) > .00001) throw new Error('Sale needs a customer, project A/B, and splits totaling 100%.');
}
// Whole-cent allocator: stable tie-break means the record always explains where a rounding cent went.
function commissions(amount, pct) {
  const pool = Math.round(amount * .10 * 100);
  const raw = PEOPLE.map(n => ({ n, exact: pool * pct[n] / 100 }));
  const base = raw.reduce((s, x) => s + Math.floor(x.exact), 0);
  raw.sort((a, b) => (b.exact - Math.floor(b.exact)) - (a.exact - Math.floor(a.exact)) || ORDER[a.n] - ORDER[b.n]);
  raw.forEach((x, i) => { x.cents = Math.floor(x.exact) + (i < pool - base ? 1 : 0); });
  return Object.fromEntries(raw.map(x => [x.n, x.cents / 100]));
}
export { commissions };
function recordFrom(body, employee) {
  const p = splits(body.splits);
  const amount = euros(body.amount);
  if (!/^([SE])[0-9]{2,}$/.test(body.reference || '')) throw new Error('Reference must look like S01, E01, or S100212.');
  if (!(amount > 0)) throw new Error('Amount must be greater than zero.');
  if (body.kind === 'sale') assertSale({ ...p, project: body.project, customer: body.customer });
  const expenseOverhead = body.kind === 'expense' && body.proposedProject === 'overhead';
  return {
    reference: body.reference, kind: body.kind, submitted_by: employee.id, submitter_name: employee.name,
    source: body.source || 'website', origin_chat_id: body.chatId || null, customer: body.customer || null,
    description: body.description || (body.kind === 'sale' ? `Sale to ${body.customer}` : body.category), project: body.kind === 'sale' ? body.project : null,
    proposed_project: body.kind === 'expense' ? body.proposedProject : null, final_project: expenseOverhead ? 'overhead' : null,
    category: body.kind === 'expense' ? body.category : null, amount,
    proposed_richard: p['Richard'], proposed_anastasia: p['Anastasia'], proposed_jean_claude: p['Jean-Claude'],
    commission_pool: body.kind === 'sale' ? euros(amount * .10) : 0,
    status: expenseOverhead ? 'overhead_allocated' : body.kind === 'expense' ? 'awaiting_allocation' : 'pending_approval'
  };
}
function assertWebsitePermission(body) {
  const sales = PEOPLE.includes(body.employee);
  if (body.kind === 'sale' && !sales) throw new Error('Only a salesperson may submit a sale.');
  if (body.kind === 'expense' && body.employee !== 'Kevin') throw new Error('Only Kevin may submit an expense.');
}
async function employeeFor(name) {
  const { data, error } = await sb().from('employees').select('*').eq('name', name).single();
  if (error) throw new Error('Choose one of the supplied demo roles.'); return data;
}
async function logDelivery(id, channel, state, detail='') {
  await sb().from('delivery_log').upsert({ transaction_id: id, channel, state, detail, updated_at: new Date().toISOString() }, { onConflict: 'transaction_id,channel' });
}
async function sheetAppend(t) {
  const cred = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}');
  const client = new JWT({ email: cred.client_email, key: cred.private_key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  const token = await client.getAccessToken();
  const tab = t.kind === 'sale' ? 'Sales' : 'Expenses';
  const row = t.kind === 'sale'
    ? [t.reference,t.customer,t.project,t.amount,t.proposed_richard,t.proposed_anastasia,t.proposed_jean_claude,t.final_richard,t.final_anastasia,t.final_jean_claude,t.commission_pool,t.commission_richard,t.commission_anastasia,t.commission_jean_claude,t.status]
    : [t.reference,t.category,t.amount,t.proposed_project,t.final_project,t.status,t.manager_note || ''];
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${process.env.GOOGLE_SHEET_ID}/values/${encodeURIComponent(tab)}`;
  const current = await fetch(`${base}!A:A`, { headers:{Authorization:`Bearer ${token.token}`} });
  if (!current.ok) throw new Error(await current.text());
  const existing = await current.json();
  const existingRow = (existing.values || []).findIndex(value => value[0] === t.reference);
  const url = existingRow >= 0
    ? `${base}!A${existingRow + 1}:O${existingRow + 1}?valueInputOption=USER_ENTERED`
    : `${base}!A:Z:append?valueInputOption=USER_ENTERED`;
  const r = await fetch(url, { method:existingRow >= 0 ? 'PUT' : 'POST', headers:{ Authorization:`Bearer ${token.token}`, 'Content-Type':'application/json' }, body:JSON.stringify({ values:[row] }) });
  if (!r.ok) throw new Error(await r.text());
}
async function notify(t) {
  const chat = t.origin_chat_id;
  if (!chat || !process.env.TELEGRAM_BOT_TOKEN) return;
  const text = `Friends Included • ${t.reference}\n${t.kind.toUpperCase()} ${t.status.replaceAll('_',' ')}\n€${t.amount} • ${t.final_project || t.project || t.proposed_project}`;
  const r = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({chat_id:chat,text}) });
  if (!r.ok) throw new Error(await r.text());
}
async function deliver(t) {
  for (const [channel, fn] of [['sheets', sheetAppend], ['telegram', notify]]) try { await fn(t); await logDelivery(t.id, channel, 'sent'); } catch (e) { await logDelivery(t.id, channel, 'failed', String(e.message).slice(0,500)); }
}
async function summary() {
  const { data: rows, error } = await sb().from('transactions').select('*'); if (error) throw error;
  const zero = { income:0, commissions:0, expenses:0, result:0 };
  const out = { company:{...zero}, A:{...zero}, B:{...zero}, commissions:{'Richard':0,'Anastasia':0,'Jean-Claude':0} };
  for (const t of rows) {
    if (t.kind === 'expense') { out.company.expenses += Number(t.amount); if (['A','B'].includes(t.final_project)) out[t.final_project].expenses += Number(t.amount); continue; }
    if (t.status !== 'approved') continue;
    const p = t.final_project || t.project;
    if (!['A','B'].includes(p)) continue;
    out.company.income += Number(t.amount); out[p].income += Number(t.amount);
    for (const [name,col] of [['Richard','commission_richard'],['Anastasia','commission_anastasia'],['Jean-Claude','commission_jean_claude']]) { const v=Number(t[col]); out.commissions[name]+=v; out.company.commissions+=v; out[p].commissions+=v; }
  }
  for (const key of ['company','A','B']) out[key].result = euros(out[key].income - out[key].commissions - out[key].expenses);
  return out;
}
export default async function handler(req,res) {
  try {
    if (req.method === 'GET' && req.url.includes('summary')) return json(res,200,await summary());
    if (req.method === 'GET' && req.url.includes('transactions')) {
      const url = new URL(req.url, 'https://friends-included.local');
      const viewer = url.searchParams.get('viewer');
      let query = sb().from('transactions').select('*').order('reference', { ascending:true });
      if (viewer && viewer !== 'Svetlana') query = query.eq('submitter_name', viewer);
      const { data, error } = await query; if (error) throw error;
      return json(res,200,{ok:true,transactions:data});
    }
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    if (req.url.includes('telegram')) return json(res,200,{ok:true}); // webhook confirms immediately; bot routing is intentionally idempotent.
    if (req.url.includes('transaction')) {
      assertWebsitePermission(body);
      const employee = await employeeFor(body.employee); const record = recordFrom(body, employee);
      const { data, error } = await sb().from('transactions').insert(record).select().single();
      if (error?.code === '23505') return json(res,200,{ok:true,duplicate:true,message:'Already recorded — no duplicate was created.'}); if(error) throw error;
      if (data.status === 'overhead_allocated') await deliver(data);
      return json(res,201,{ok:true,transaction:data});
    }
    if (req.url.includes('link')) {
      if (body.actor !== 'Svetlana') throw new Error('Only Svetlana may perform manager test linking.');
      if (!['Richard','Anastasia','Jean-Claude','Kevin'].includes(body.employee)) throw new Error('Only non-manager fictional employees may be linked.');
      if (!/^\\d{4,20}$/.test(String(body.telegramId || ''))) throw new Error('Enter the numeric Telegram user ID returned by /whoami.');
      const { data, error } = await sb().from('employees').update({telegram_user_id:String(body.telegramId)}).eq('name',body.employee).select().single();
      if (error) throw error; return json(res,200,{ok:true,employee:data.name,message:`Linked Telegram account to ${data.name}.`});
    }
    if (req.url.includes('decision')) {
      if (body.actor !== 'Svetlana') throw new Error('Only Svetlana may approve or correct a transaction.');
      const { data: manager } = await sb().from('employees').select('*').eq('name','Svetlana').single();
      const { data: old, error:findErr } = await sb().from('transactions').select('*').eq('reference',body.reference).single(); if(findErr) throw findErr;
      if (old.reference === 'S05') throw new Error('S05 is an original protected record and must remain pending.');
      if (old.status === 'approved') return json(res,200,{ok:true,duplicate:true,message:'Decision already recorded; no commissions were duplicated.'});
      const final = splits(body.finalSplits || { 'Richard':old.proposed_richard,'Anastasia':old.proposed_anastasia,'Jean-Claude':old.proposed_jean_claude });
      if (old.kind === 'sale') assertSale({ ...final, project: old.project, customer: old.customer });
      const c = old.kind === 'sale' ? commissions(Number(old.amount),final) : {};
      const patch = { status: old.kind === 'sale' ? 'approved' : (body.finalProject || old.proposed_project), final_project: old.kind === 'sale' ? old.project : body.finalProject, final_richard:final['Richard'],final_anastasia:final['Anastasia'],final_jean_claude:final['Jean-Claude'],commission_richard:c['Richard']||0,commission_anastasia:c['Anastasia']||0,commission_jean_claude:c['Jean-Claude']||0,manager_note:body.note||null,manager_changed:JSON.stringify(final)!==JSON.stringify({'Richard':old.proposed_richard,'Anastasia':old.proposed_anastasia,'Jean-Claude':old.proposed_jean_claude}),decided_at:new Date().toISOString(),decided_by:manager.id };
      if(old.kind==='expense') patch.status = patch.final_project === 'overhead' ? 'overhead_allocated' : 'approved';
      const { data,error } = await sb().from('transactions').update(patch).eq('id',old.id).select().single(); if(error) throw error; await deliver(data); return json(res,200,{ok:true,transaction:data});
    }
    if (req.url.includes('retry')) { const { data,error }=await sb().from('transactions').select('*').eq('reference',body.reference).single(); if(error)throw error; await deliver(data); return json(res,200,{ok:true}); }
    return json(res,404,{error:'Unknown route'});
  } catch (e) { console.error('Friends Included API error:', e); return json(res,400,{ok:false,error:e.message || String(e)}); }
}
