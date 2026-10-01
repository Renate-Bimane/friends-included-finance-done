export default async function handler(req,res){
 if(req.method!=="POST")return res.status(405).json({ok:false});
 if(!process.env.SHEETS_WEBHOOK_URL)return res.status(503).json({ok:false,message:"Sheets route is awaiting secure deployment configuration."});
 const upstream=await fetch(process.env.SHEETS_WEBHOOK_URL,{method:"POST",headers:{"Content-Type":"application/json","X-FI-Sync":process.env.FI_SYNC_SECRET||""},body:JSON.stringify(req.body)});
 const body=await upstream.text();
 return res.status(upstream.ok?200:502).json({ok:upstream.ok,message:body});
}
