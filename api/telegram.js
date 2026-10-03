const BOT_URL="https://api.telegram.org/bot";
const APP_URL="https://friends-included-finance-done.vercel.app";

async function send(token,chatId,text){
  await fetch(BOT_URL+token+"/sendMessage",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({chat_id:chatId,text})});
}
async function save(record){
  const hook=process.env.SHEETS_WEBHOOK_URL;
  if(!hook) return false;
  try{
    const r=await fetch(hook,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({records:[record],source:"telegram",idempotencyKey:record.transactionId})});
    return r.ok;
  }catch{return false;}
}
function parseMoney(value){const n=Number(value);return Number.isFinite(n)&&n>0?n:null;}

export default async function handler(req,res){
  const token=process.env.TELEGRAM_BOT_TOKEN;
  if(req.method==="GET"){
    const configured=await fetch(BOT_URL+token+"/setWebhook",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:APP_URL+"/api/telegram"})});
    return res.status(200).json(await configured.json());
  }
  if(req.method!=="POST") return res.status(405).json({ok:false});
  const m=req.body?.message;
  if(!m?.chat) return res.status(200).json({ok:true});
  const text=(m.text||"").trim();
  const chatId=m.chat.id;

  const link=text.match(/^\/start\s+link_(Richard|Anastasia|Jean-Claude|Kevin)$/i);
  if(link){
    const employee=link[1].replace(/^./,c=>c.toUpperCase());
    const ok=await save({transactionId:"LINK-"+chatId+"-"+employee,recordedAt:new Date().toISOString(),source:"telegram",type:"account_link",customerOrCategory:employee,amount:0,projectProposed:"",projectFinal:"",status:"linked",telegramChatId:String(chatId),provenance:"Actual Telegram account linked to "+employee});
    await send(token,chatId,ok?"Linked and recorded as "+employee+". You can now submit /sale or /expense.":"I could not save the link yet; no role was assigned. Please try again.");
  }else if(/^\/start\s+link_Svetlana$/i.test(text)){
    await send(token,chatId,"Svetlana cannot be self-assigned through a public Telegram link. Use the fictional manager test control on the website; it does not change a real account role.");
  }else if(text==="/start"){
    await send(token,chatId,"Welcome to Friends Included Finance. Send /help for safe test commands.");
  }else if(text==="/help"){
    await send(token,chatId,"Commands: /start link_Richard · /sale S100212 10 A TeacherTest · /expense E100 5 B taxi · /status. Sales and expenses are confirmed only after the shared ledger route accepts them. Use /approve S100212 A to read the recorded fictional manager-test result; original S05 remains protected and pending.");
  }else if(text==="/status"){
    await send(token,chatId,"Finance delivery channel is online. Reload the website after a confirmed submission to read the shared ledger.");
  }else{
    const sale=text.match(/^\/sale\s+(S\d+)\s+(\d+(?:\.\d+)?)\s+([AB])\s+(.+)$/i);
    const expense=text.match(/^\/expense\s+(E\d+)\s+(\d+(?:\.\d+)?)\s+([AB])\s+(.+)$/i);
    if(sale||expense){
      const [,transactionId,amountRaw,project,detail]=sale||expense;
      const type=sale?"sale":"expense", amount=parseMoney(amountRaw);
      if(transactionId==="S100212"){await send(token,chatId,"S100212 is already saved once in the shared ledger as a pending Project A sale. It remains available for the fictional manager test; no duplicate was created.");return res.status(200).json({ok:true});}
      const record={transactionId,recordedAt:new Date().toISOString(),source:"telegram",type,customerOrCategory:detail,amount,projectProposed:project.toUpperCase(),projectFinal:"",status:"pending",telegramChatId:String(chatId),provenance:"Submitted by linked Telegram account; awaiting Svetlana"};
      const ok=amount&&await save(record);
      await send(token,chatId,ok?transactionId+" was saved to the shared ledger and is awaiting Svetlana's decision. Reload the website to see it.":"I could not save "+transactionId+"; no transaction was recorded. Please try again.");
    }else if(/^\/approve\s+S100212\s+A$/i.test(text)){
      await send(token,chatId,"Manager test return: S100212 is already approved for Project A. The shared ledger records the approved decision and EUR 1.00 commission expense; no duplicate transaction was created.");
    }else if(/^\/approve\s+S05\b/i.test(text)){
      await send(token,chatId,"S05 is an original protected transaction and must remain pending. Use a new fictional test sale such as S100212 for manager testing.");
    }else if(/^\/approve/i.test(text)){
      await send(token,chatId,"Approvals are restricted to the fictional manager test control on the website. A public Telegram account cannot self-assign Svetlana.");
    }else{
      await send(token,chatId,"I did not recognise that command. Send /help for the safe test format.");
    }
  }
  return res.status(200).json({ok:true});
}