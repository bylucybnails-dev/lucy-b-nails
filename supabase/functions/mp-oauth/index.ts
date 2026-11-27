const api=Deno.env.get('SUPABASE_URL')!;
const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const publishable=Deno.env.get('SUPABASE_ANON_KEY')!;
const site=new URL(Deno.env.get('MP_SITE_URL')||'https://lucy-b-nails.by-lucyb-nails.workers.dev').origin;
const claim=Deno.env.get('MP_ADMIN_ROLE_CLAIM')||'lucy_role';
const redirect=api.replace(/\/$/,'')+'/functions/v1/mp-oauth/callback';
const encoder=new TextEncoder();
const decoder=new TextDecoder();
const b64=(v:Uint8Array)=>btoa(String.fromCharCode(...v)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unb64=(v:string)=>Uint8Array.from(atob(v.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-v.length%4)%4)),c=>c.charCodeAt(0));
const random=()=>b64(crypto.getRandomValues(new Uint8Array(32)));
async function sha(v:string){return b64(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(v))))}
function configured(){return !!(Deno.env.get('MP_CLIENT_ID')&&Deno.env.get('MP_CLIENT_SECRET')&&/^[0-9a-f]{64}$/i.test(Deno.env.get('MP_ENCRYPTION_KEY')||''))}
async function key(){const v=Deno.env.get('MP_ENCRYPTION_KEY')||'';if(!/^[0-9a-f]{64}$/i.test(v))throw Error('invalid_key');return crypto.subtle.importKey('raw',Uint8Array.from(v.match(/../g)!,x=>parseInt(x,16)),'AES-GCM',false,['encrypt','decrypt'])}
async function seal(value:string,aad:string){const iv=crypto.getRandomValues(new Uint8Array(12));const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(aad)},await key(),encoder.encode(value));return b64(iv)+'.'+b64(new Uint8Array(cipher))}
async function unseal(value:string,aad:string){const [iv,cipher]=value.split('.');return decoder.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(iv),additionalData:encoder.encode(aad)},await key(),unb64(cipher)))}
const baseHeaders={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
const cors={...baseHeaders,'Access-Control-Allow-Origin':site,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization, apikey, content-type','Vary':'Origin'};
function json(value:unknown,status=200){return new Response(JSON.stringify(value),{status,headers:{...cors,'Content-Type':'application/json'}})}
function back(status:string){return new Response(null,{status:303,headers:{...baseHeaders,Location:site+'/?mp_connection='+status}})}
async function db(path:string,init:RequestInit={}){const res=await fetch(api+'/rest/v1/'+path,{...init,headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json',Prefer:'return=representation',...init.headers}});if(!res.ok)throw Error('storage_error');const text=await res.text();return text?JSON.parse(text):null}
function admin(u:any){return !!(u?.id&&u?.email_confirmed_at&&u?.app_metadata?.[claim]==='admin')}
async function authenticated(req:Request){const token=req.headers.get('Authorization');if(!token?.startsWith('Bearer '))return null;const r=await fetch(api+'/auth/v1/user',{headers:{apikey:publishable,Authorization:token}});if(!r.ok)return null;const u=await r.json();return admin(u)?u:null}
async function callback(url:URL){
 if(!configured())return back('not_configured');
 const state=url.searchParams.get('state')||'';
 if(!/^[A-Za-z0-9_-]{43}$/.test(state))return back('invalid');
 const hash=await sha(state);
 const attempt=await db('mp_oauth_attempt?id=eq.1&state_hash=eq.'+hash+'&expires_at=gt.'+encodeURIComponent(new Date().toISOString()),{method:'DELETE'});
 if(!Array.isArray(attempt)||attempt.length!==1)return back('expired');
 if(url.searchParams.has('error'))return back('cancelled');
 const code=url.searchParams.get('code');if(!code||code.length>2048)return back('invalid');
 const who=await fetch(api+'/auth/v1/admin/users/'+encodeURIComponent(attempt[0].administrator),{headers:{apikey:service,Authorization:'Bearer '+service}});
 if(!who.ok||!admin(await who.json()))return back('invalid');
 if((await db('mp_connection?id=eq.1&select=id')).length)return back('already_connected');
 const verifier=await unseal(attempt[0].verifier_encrypted,'state:'+hash);
 const tokenResponse=await fetch('https://api.mercadopago.com/oauth/token',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({client_id:Deno.env.get('MP_CLIENT_ID'),client_secret:Deno.env.get('MP_CLIENT_SECRET'),grant_type:'authorization_code',code,redirect_uri:redirect,code_verifier:verifier})});
 if(!tokenResponse.ok)return back('provider_error');
 const t=await tokenResponse.json();const seller=String(t.user_id??'');const seconds=Number(t.expires_in);
 if(!/^[0-9]+$/.test(seller)||typeof t.access_token!=='string'||!t.access_token||typeof t.refresh_token!=='string'||!t.refresh_token||!Number.isFinite(seconds)||seconds<=0||typeof t.live_mode!=='boolean')return back('provider_error');
 const encrypted=await seal(JSON.stringify({access_token:t.access_token,refresh_token:t.refresh_token,scope:t.scope||''}),'seller:'+seller);
 await db('mp_connection',{method:'POST',body:JSON.stringify({id:1,seller_id:seller,credentials_encrypted:encrypted,expires_at:new Date(Date.now()+seconds*1000).toISOString(),live_mode:t.live_mode})});
 return back('connected');
}
Deno.serve(async(req)=>{
 const url=new URL(req.url);
 try{
  if(req.method==='GET'&&url.pathname.endsWith('/callback'))return await callback(url);
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(req.method!=='POST'||req.headers.get('Origin')!==site)return json({error:'not_allowed'},403);
  const user=await authenticated(req);if(!user)return json({error:'forbidden'},403);
  const body=await req.json();
  const connection=(await db('mp_connection?id=eq.1&select=seller_id,expires_at,connected_at,live_mode'))[0];
  if(body.action==='status')return json({configured:configured(),connection:connection||null,payments_enabled:false});
  if(body.action!=='start')return json({error:'invalid_action'},400);
  if(!configured())return json({error:'not_configured'},503);
  if(connection)return json({error:'already_connected'},409);
  const state=random(),verifier=random(),hash=await sha(state);
  await db('mp_oauth_attempt?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({id:1,state_hash:hash,administrator:user.id,verifier_encrypted:await seal(verifier,'state:'+hash),expires_at:new Date(Date.now()+600000).toISOString()})});
  const auth=new URL('https://auth.mercadopago.com/authorization');auth.search=new URLSearchParams({client_id:Deno.env.get('MP_CLIENT_ID')!,response_type:'code',platform_id:'mp',state,redirect_uri:redirect,code_challenge:await sha(verifier),code_challenge_method:'S256'}).toString();
  return json({authorization_url:auth.toString()});
 }catch{return req.method==='GET'?back('error'):json({error:'operation_failed'},500)}
});