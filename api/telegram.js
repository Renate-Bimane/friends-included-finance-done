import { createClient } from '@supabase/supabase-js';

const names = ['Richard Darling','Anastasia Ferrari','Jean-Claude Bērziņš'];
const bot = (token, chat, text) => fetch(`https://api.telegram.org/bot${token}/sendMessage`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chat,text})});
const reply = async (token, chat, text) => { const r=await bot(token,chat,text); if(!r.ok) throw new Error(await r.text()); };

export default async function handler(req,res) {
  if (req.method !== 'POST') return res.status(405).json({ok:false});
  const token=process.env.TELEGRAM_BOT_TOKEN;
  const message=req.body?.message;
  if (!token || !message?.from?.id || !message?.chat?.id) return res.status(200).json({ok:true});
  try {
    const sb=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
    const userId=String(message.from.id), chatId=String(message.chat.id), text=(message.text||'').trim();
    if(text==='/start') { await reply(token,chatId,'Friends Included Finance. Send /whoami, then ask Svetlana to link this Telegram ID in Manager setup.'); return res.status(200).json({ok:true}); }
    if(text==='/whoami') { await reply(token,chatId,`Your Telegram user ID is ${userId}. Give this to Svetlana; you cannot assign yourself a role.`); return res.status(200).json({ok:true}); }
    const {data:employee}=await sb.from('employees').select('*').eq('telegram_user_id',userId).single();
    if(!employee) { await reply(token,chatId,'This Telegram account is not linked to a fictional employee. Send /whoami and ask Svetlana to link it.'); return res.status(200).json({ok:true}); }
    if(employee.telegram_chat_id!==chatId) await sb.from('employees').update({telegram_chat_id:chatId}).eq('id',employee.id);
    const sale=text.match(/^\/sale\s+(S\d+)\s+(\d+(?:\.\d+)?)\s+([AB])\s+([^|]+)\|\s*([^|]+)\|\s*(\d+)\/(\d+)\/(\d+)$/i);
    const expense=text.match(/^\/expense\s+(E\d+)\s+(\d+(?:\.\d+)?)\s+(A|B|overhead)\s+([^|]+)\|\s*(Materials|Travel|Other)$/i);
    if(sale) {
      if(!names.includes(employee.name)) { await reply(token,chatId,'Only a salesperson can submit a sale.'); return res.status(200).json({ok:true}); }
      const [,reference,amount,project,customer,description,richard,anastasia,jean]=sale;
      const r=await fetch(`${process.env.APP_BASE_URL}/api/transaction`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({employee:employee.name,source:'telegram',chatId,reference,kind:'sale',amount,project,customer:customer.trim(),description:description.trim(),splits:{'Richard Darling':richard,'Anastasia Ferrari':anastasia,'Jean-Claude Bērziņš':jean}})});
      const body=await r.json(); await reply(token,chatId,body.ok?`${reference} recorded: €${amount}, Project ${project}, Pending approval.`:`Could not record ${reference}: ${body.error||body.message}`); return res.status(200).json({ok:true});
    }
    if(expense) {
      if(employee.name!=='Kevin von Whatever') { await reply(token,chatId,'Only Kevin can submit an expense.'); return res.status(200).json({ok:true}); }
      const [,reference,amount,proposedProject,description,category]=expense;
      const r=await fetch(`${process.env.APP_BASE_URL}/api/transaction`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({employee:employee.name,source:'telegram',chatId,reference,kind:'expense',amount,proposedProject,description:description.trim(),category})});
      const body=await r.json(); await reply(token,chatId,body.ok?`${reference} recorded: €${amount}, proposed ${proposedProject}. ${proposedProject==='overhead'?'Company overhead allocated.':'Awaiting allocation.'}`:`Could not record ${reference}: ${body.error||body.message}`); return res.status(200).json({ok:true});
    }
    await reply(token,chatId,'Commands: /whoami; /sale S01 1000 A Olivia Rose | proud uncle | 50/30/20; /expense E01 120 A | rented suit | Materials');
    return res.status(200).json({ok:true});
  } catch(error) { return res.status(500).json({ok:false,error:error.message}); }
}
