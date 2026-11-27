const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
function normalized(v:string){let d=v.replace(/\D/g,'');if(d.startsWith('549')&&d.length===13)d=d.slice(3);else if(d.startsWith('54')&&d.length===12)d=d.slice(2);if(d.length===11&&d.startsWith('0'))d=d.slice(1);return d}
Deno.serve(async req=>{
if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
if(req.method!=='POST')return reply({error:'Método no permitido'},405);
try{
const raw=await req.text();if(raw.length>2048)return reply({error:'Solicitud inválida'},400);
const {phone,code,claim}=JSON.parse(raw);if(typeof phone!=='string'||typeof code!=='string'||phone.length>40||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(code.trim())||normalized(phone).length<8)return reply({error:'Revisá el teléfono y código de reserva.'},400);
const base=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');if(!base||!key)return reply({error:'Consulta no disponible.'},503);
const query=new URLSearchParams({lookup_code:'eq.'+code.trim(),select:'id,customer_user_id,city,starts_at,ends_at,customer_phone,selection,total_ars,deposit_ars,status',limit:'1'});
const res=await fetch(base+'/rest/v1/appointments?'+query,{headers:{apikey:key,Authorization:'Bearer '+key}});
if(!res.ok)return reply({error:'Consulta no disponible.'},503);
const rows=await res.json();const row=rows[0];if(!row||normalized(row.customer_phone)!==normalized(phone))return reply({error:'No encontramos una reserva con esos datos.'},404);
if(claim===true){
const auth=req.headers.get('Authorization');if(!auth?.startsWith('Bearer '))return reply({error:'Iniciá sesión primero.'},401);
const userRes=await fetch(base+'/auth/v1/user',{headers:{apikey:key,Authorization:auth}});
if(!userRes.ok)return reply({error:'Volvé a iniciar sesión.'},401);
const user=await userRes.json();if(!user.id||!user.email_confirmed_at)return reply({error:'Confirmá tu cuenta primero.'},403);
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