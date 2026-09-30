export default async function handler(req,res){
  const token=process.env.TELEGRAM_BOT_TOKEN;
  if(req.method==="GET"){
    const configured=await fetch("https://api.telegram.org/bot"+token+"/setWebhook",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:"https://friends-included-finance-done.vercel.app/api/telegram"})});
    return res.status(200).json(await configured.json());
  }
  if(req.method!=="POST")return res.status(405).json({ok:false});
  const m=req.body&&req.body.message;
  if(!m||!m.chat)return res.status(200).json({ok:true});
  const t=(m.text||"").trim();
  const reply=t==="/start"?"Welcome to Friends Included Finance. Send /help for commands.":t==="/help"?"Commands: /start — open Finance Command Center; /status — delivery channel online.":t==="/status"?"Friends Included Finance delivery channel is online.":"I received your message. Use /help for available commands.";
  await fetch("https://api.telegram.org/bot"+token+"/sendMessage",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({chat_id:m.chat.id,text:reply})});
  return res.status(200).json({ok:true});
}
