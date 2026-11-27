// Narrow server-to-server bridge: never accept a browser payment claim.
const enc=new TextEncoder();
const headers={'Content-Type':'application/json','Cache-Control':'no-store'};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const numberId=(v:unknown)=>typeof v==='string'&&/^[0-9]{1,30}$/.test(v);
Deno.serve(async(req:Request)=>{
 if(req.method!=='POST')return json({error:'method_not_allowed'},405);
 const secret=Deno.env.get('MP_BRIDGE_SECRET')||'';
 if(!/^[0-9a-f]{64}$/i.test(secret))return json({error:'not_configured'},503);
 const ts=req.headers.get('x-bridge-ts')||'',sig=req.headers.get('x-bridge-signature')||'';
 if(!/^[0-9]{13}$/.test(ts)||Math.abs(Date.now()-Number(ts))>120000||!/^[0-9a-f]{64}$/i.test(sig))return json({error:'unauthorized'},401);
 try{
  const reader=req.body?.getReader();if(!reader)return json({error:'missing_body'},400);
  let total=0;const chunks:Uint8Array[]=[];
  while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>8192){await reader.cancel();return json({error:'body_too_large'},413)}chunks.push(value)}
  const bytes=new Uint8Array(total);let i=0;for(const chunk of chunks){bytes.set(chunk,i);i+=chunk.byteLength}
  const raw=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  const mac=Uint8Array.from(sig.match(/../g)!,x=>parseInt(x,16));
  if(!await crypto.subtle.verify('HMAC',key,mac,enc.encode('lucy-b-nails:'+ts+':'+raw)))return json({error:'unauthorized'},401);
  const body=JSON.parse(raw);
  if(body.tenant!=='lucy-b-nails')return json({error:'tenant_mismatch'},403);
  const enabled=Deno.env.get('MP_PAYMENTS_ENABLED')==='true';
  if(body.action==='ping')return json({authenticated:true,payments_enabled:enabled});
  if(!enabled)return json({error:'payments_disabled'},503);
  if(!uuid(body.booking_id)||!numberId(body.seller_id))return json({error:'invalid_booking'},400);
  let rpc:string,params:Record<string,unknown>;
  if(body.action==='register_preference'&&typeof body.preference_id==='string'&&body.preference_id.length>0&&body.preference_id.length<=160){
   rpc='register_deposit_preference';params={p_booking:body.booking_id,p_seller:body.seller_id,p_preference:body.preference_id};
  }else if(body.action==='apply_verified_deposit'&&numberId(body.payment_id)&&Number.isFinite(body.amount)&&body.amount>=0&&body.amount<=999999999999&&typeof body.currency==='string'&&/^[A-Z]{3}$/.test(body.currency)){
   rpc='apply_verified_deposit';params={p_booking:body.booking_id,p_seller:body.seller_id,p_payment:body.payment_id,p_amount:body.amount,p_currency:body.currency};
  }else if(body.action==='record_deposit_incident'&&numberId(body.payment_id)&&['refunded','partial_refund','charged_back','in_mediation','amount_mismatch','late_or_unavailable','duplicate_deposit'].includes(body.kind)&&typeof body.updated_at==='string'&&Number.isFinite(Date.parse(body.updated_at))&&Number.isFinite(body.amount)&&Number.isFinite(body.refunded)&&body.amount>=0&&body.refunded>=0&&body.refunded<=body.amount&&body.amount<=999999999999){
   rpc='record_deposit_incident';params={p_booking:body.booking_id,p_seller:body.seller_id,p_payment:body.payment_id,p_kind:body.kind,p_updated:body.updated_at,p_amount:body.amount,p_refunded:body.refunded};
  }else return json({error:'invalid_action'},400);
  const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const r=await fetch(Deno.env.get('SUPABASE_URL')+'/rest/v1/rpc/'+rpc,{method:'POST',headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},body:JSON.stringify(params),signal:AbortSignal.timeout(10000)});
  if(!r.ok)return json({error:'reservation_operation_failed'},409);
  return json(await r.json());
 }catch{return json({error:'operation_failed'},500)}
});