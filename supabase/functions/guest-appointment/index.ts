const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
function normalized(v:string){let d=v.replace(/\D/g,'');if(d.startsWith('549')&&d.length===13)d=d.slice(3);else if(d.startsWith('54')&&d.length===12)d=d.slice(2);if(d.length===11&&d.startsWith('0'))d=d.slice(1);return d}
Deno.serve(async req=>{
if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
if(req.method!=='POST')return reply({error:'Método no permitido'},405);
try{
const reader=req.body?.getReader();if(!reader)return reply({error:'Solicitud inválida'},400);
let size=0;const chunks:Uint8Array[]=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){await reader.cancel();return reply({error:'Solicitud inválida'},400)}chunks.push(value)}
const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.byteLength}
const {phone,code,claim,turnstile_token}=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
if(code===undefined){
 if(claim===true||typeof phone!=='string'||phone.length>40||!/^[0-9]{10}$/.test(normalized(phone)))return reply({error:'Ingresá un teléfono argentino válido.'},400);
 const base=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),secret=Deno.env.get('TURNSTILE_SECRET_KEY'),bridge=Deno.env.get('MP_BRIDGE_SECRET');
 if(!base||!key||!secret||!bridge)return reply({error:'Consulta no disponible.'},503);
 if(typeof turnstile_token!=='string'||!turnstile_token||turnstile_token.length>2048)return reply({error:'Completá la verificación de seguridad.'},400);
 const captcha=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret,response:turnstile_token}),signal:AbortSignal.timeout(8000)});
 const v=captcha.ok?await captcha.json():null;if(v?.success!==true||v.hostname!=='lucy-b-nails.by-lucyb-nails.workers.dev'||v.action!=='guest_lookup')return reply({error:'No se pudo verificar la consulta.'},403);
 const enc=new TextEncoder(),n=normalized(phone),mac=await crypto.subtle.importKey('raw',enc.encode(bridge),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const hash=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',mac,enc.encode('guest-lookup:'+n))),b=>b.toString(16).padStart(2,'0')).join('');
 const response=await fetch(base+'/rest/v1/rpc/lookup_guest_status',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({p_phone:n,p_key:hash}),signal:AbortSignal.timeout(10000)});
 if(!response.ok)return reply({error:'Consulta no disponible.'},503);
 const result=await response.json();if(result.limited)return reply({error:'Demasiadas consultas. Probá más tarde.'},429);
 if(!Array.isArray(result.statuses))return reply({error:'Consulta no disponible.'},503);
 return reply({statuses:result.statuses.filter((s:unknown)=>['confirmed','held','payment_review'].includes(String(s)))});
}
if(typeof phone!=='string'||typeof code!=='string'||phone.length>40||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(code.trim())||normalized(phone).length<8)return reply({error:'Revisá el teléfono y código de reserva.'},400);
const base=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');if(!base||!key)return reply({error:'Consulta no disponible.'},503);
const query=new URLSearchParams({lookup_code:'eq.'+code.trim(),select:'id,customer_user_id,city,starts_at,ends_at,customer_phone,selection,total_ars,deposit_ars,status',limit:'1'});
const res=await fetch(base+'/rest/v1/appointments?'+query,{headers:{apikey:key,Authorization:'Bearer '+key}});
if(!res.ok)return reply({error:'Consulta no disponible.'},503);
const rows=await res.json();const row=rows[0];if(!row||normalized(row.customer_phone)!==normalized(phone))return reply({error:'No encontramos una reserva con esos datos.'},404);
if(claim===true){
const auth=req.headers.get('Authorization');if(!auth?.startsWith('Bearer '))return reply({error:'Iniciá sesión primero.'},401);
const userRes=await fetch(base+'/auth/v1/user',{headers:{apikey:key,Authorization:auth}});
if(!userRes.ok)return reply({error:'Volvé a iniciar sesión.'},401);
const user=await userRes.json();if(!user.id||!user.email_confirmed_at||user.is_anonymous)return reply({error:'Confirmá tu cuenta primero.'},403);
if(row.customer_user_id&&row.customer_user_id!==user.id)return reply({error:'Este turno ya está vinculado a otra cuenta.'},409);
if(!row.customer_user_id){
const patch=new URLSearchParams({id:'eq.'+row.id,customer_user_id:'is.null',lookup_code:'eq.'+code.trim()});
const result=await fetch(base+'/rest/v1/appointments?'+patch,{method:'PATCH',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({customer_user_id:user.id})});
if(!result.ok)return reply({error:'No se pudo vincular el turno.'},503);
if((await result.json()).length!==1)return reply({error:'El turno cambió. Volvé a consultarlo.'},409);
}
}
delete row.customer_phone;delete row.customer_user_id;delete row.id;return reply({reservation:row,linked:claim===true});
}catch{return reply({error:'No se pudo consultar la reserva.'},400)}
});