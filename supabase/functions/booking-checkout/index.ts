// Checkout entrypoint. Disabled until end-to-end tests and anti-abuse controls are complete.
const RELEASED=false;
const ORIGIN='https://lucy-b-nails.by-lucyb-nails.workers.dev';
const CENTRAL='https://mercadopago-integraciones.aquipinocqn.workers.dev/internal/v1/merchants/lucy-b-nails/checkout';
const enc=new TextEncoder();
const headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin'};
const json=(v:unknown,s=200)=>new Response(JSON.stringify(v),{status:s,headers});
const integer=(v:unknown,lo:number,hi:number)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=lo&&v<=hi;
Deno.serve(async(req:Request)=>{
 if(req.headers.get('Origin')!==ORIGIN)return json({error:'forbidden'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return json({error:'method_not_allowed'},405);
 if(new URL(req.url).searchParams.get('diagnostic')==='turnstile'){
  try{
   const auth=req.headers.get('Authorization')||'',service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',base=Deno.env.get('SUPABASE_URL')||'';
   if(!auth.startsWith('Bearer ')||!service||!base)return json({error:'unauthorized'},401);
   const u=await fetch(base+'/auth/v1/user',{headers:{apikey:service,Authorization:auth},signal:AbortSignal.timeout(8000)});
   if(!u.ok)return json({error:'unauthorized'},401);
   const user=await u.json();
   if(!user.email_confirmed_at||user.app_metadata?.lucy_role!=='admin')return json({error:'forbidden'},403);
   const secret=Deno.env.get('TURNSTILE_SECRET_KEY')||'';
   if(!secret)return json({error:'captcha_not_configured'},503);
   const reader=req.body?.getReader();if(!reader)return json({error:'invalid_input'},400);
   let n=0;const chunks:Uint8Array[]=[];
   while(true){const {done,value}=await reader.read();if(done)break;n+=value.byteLength;if(n>4096){await reader.cancel();return json({error:'body_too_large'},413)}chunks.push(value)}
   const bytes=new Uint8Array(n);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.byteLength}
   const b=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
   if(typeof b.token!=='string'||!b.token||b.token.length>2048)return json({error:'invalid_token'},400);
   const response=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret,response:b.token}),signal:AbortSignal.timeout(8000)});
   const v=response.ok?await response.json():null;
   if(v?.success!==true||v.hostname!==new URL(ORIGIN).hostname||v.action!=='booking_checkout')return json({error:'captcha_invalid'},403);
   return json({verified:true,payments_enabled:false});
  }catch{return json({error:'diagnostic_failed'},503)}
 }
 if(!RELEASED||Deno.env.get('MP_PAYMENTS_ENABLED')!=='true')return json({error:'payments_disabled'},503);
 const secret=Deno.env.get('MP_BRIDGE_SECRET')||'',service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',base=Deno.env.get('SUPABASE_URL')||'';
 if(!/^[0-9a-f]{64}$/i.test(secret)||!service||!base)return json({error:'not_configured'},503);
 try{
  const reader=req.body?.getReader();if(!reader)return json({error:'invalid_input'},400);
  let n=0;const chunks:Uint8Array[]=[];
  while(true){const {done,value}=await reader.read();if(done)break;n+=value.byteLength;if(n>8192){await reader.cancel();return json({error:'body_too_large'},413)}chunks.push(value)}
  const bytes=new Uint8Array(n);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.byteLength}
  const b=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if(!b||!integer(b.city,0,1)||typeof b.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(b.date)||typeof b.time!=='string'||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(b.time)||!integer(b.revision,1,Number.MAX_SAFE_INTEGER)||!['services','own','other'].includes(b.mode)||!integer(b.service,0,1000)||!integer(b.qty,1,10)||!integer(b.removal,-1,1000)||b.duration!==1||typeof b.name!=='string'||b.name.trim().length<1||b.name.trim().length>120||typeof b.phone!=='string'||b.phone.trim().length<5||b.phone.trim().length>40||!b.extras||typeof b.extras!=='object'||Array.isArray(b.extras)||Object.keys(b.extras).length>30||Object.entries(b.extras).some(([k,v])=>!/^\d{1,5}$/.test(k)||!integer(v,0,5)))return json({error:'invalid_input'},400);
  const captchaSecret=Deno.env.get('TURNSTILE_SECRET_KEY')||'';
  if(!captchaSecret)return json({error:'captcha_not_configured'},503);
  if(typeof b.turnstile_token!=='string'||b.turnstile_token.length<1||b.turnstile_token.length>2048)return json({error:'captcha_required'},400);
  const captcha=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret:captchaSecret,response:b.turnstile_token}),signal:AbortSignal.timeout(8000)});
  const verification=captcha.ok?await captcha.json():null;
  if(verification?.success!==true||verification.hostname!==new URL(ORIGIN).hostname||verification.action!=='booking_checkout')return json({error:'captcha_invalid'},403);
  const authHeaders={apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'};
  let customerId:string|null=null;
  // Never trust a caller-supplied customer ID; resolve the session with Auth.
  if(b.customer_access_token!==undefined){
   if(typeof b.customer_access_token!=='string'||b.customer_access_token.length>8192)return json({error:'invalid_session'},401);
   const u=await fetch(base+'/auth/v1/user',{headers:{apikey:service,Authorization:'Bearer '+b.customer_access_token},signal:AbortSignal.timeout(8000)});
   if(!u.ok)return json({error:'invalid_session'},401);
   const user=await u.json();
   if(!user.id||!user.email_confirmed_at||user.is_anonymous||user.app_metadata?.lucy_role==='admin')return json({error:'invalid_session'},401);
   customerId=user.id;
  }
  const r=await fetch(base+'/rest/v1/rpc/create_protected_booking_hold',{method:'POST',headers:authHeaders,body:JSON.stringify({p_city:b.city,p_date:b.date,p_time:b.time,p_revision:b.revision,p_mode:b.mode,p_service:b.service,p_qty:b.qty,p_extras:b.extras,p_removal:b.removal,p_name:b.name,p_phone:b.phone,p_duration:b.duration,p_customer:customerId}),signal:AbortSignal.timeout(10000)});
  if(!r.ok)return json({error:'hold_unavailable'},409);
  const hold=await r.json();
  if(!hold.id||!Number.isSafeInteger(hold.deposit)||hold.deposit<=0)return json({error:'checkout_unavailable'},409);
  if(!hold.lookup_code)return json({error:'checkout_unavailable'},503);
  const raw=JSON.stringify({tenant:'lucy-b-nails',booking_id:hold.id,deposit_ars:hold.deposit,expires_at:hold.expires_at});
  const ts=String(Date.now()),key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const sig=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode('checkout:lucy-b-nails:'+ts+':'+raw))),x=>x.toString(16).padStart(2,'0')).join('');
  const checkout=await fetch(CENTRAL,{method:'POST',headers:{'Content-Type':'application/json','x-bridge-ts':ts,'x-bridge-signature':sig},body:raw,signal:AbortSignal.timeout(30000)});
  if(!checkout.ok)return json({error:'checkout_unavailable',expires_at:hold.expires_at},503);
  const p=await checkout.json(),url=new URL(p.checkout_url);
  if(url.protocol!=='https:'||!['www.mercadopago.com.ar','mercadopago.com.ar','www.mercadopago.com','mercadopago.com'].includes(url.hostname)||url.username||url.password||url.port)return json({error:'invalid_checkout'},503);
  return json({booking_id:hold.id,lookup_code:hold.lookup_code,total:hold.total,deposit:hold.deposit,expires_at:hold.expires_at,checkout_url:url.toString()});
 }catch{return json({error:'checkout_unavailable'},503)}
});
