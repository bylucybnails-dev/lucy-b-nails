const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
function normalized(v:string){let d=v.replace(/\D/g,'');if(d.startsWith('549')&&d.length===13)d=d.slice(3);else if(d.startsWith('54')&&d.length===12)d=d.slice(2);if(d.length===11&&d.startsWith('0'))d=d.slice(1);return d}
Deno.serve(async req=>{
if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
if(req.method!=='POST')return reply({error:'Método no permitido'},405);
try{
const raw=await req.text();if(raw.length>2048)return reply({error:'Solicitud inválida'},400);
const {phone,code}=JSON.parse(raw);if(typeof phone!=='string'||typeof code!=='string'||phone.length>40||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(code.trim())||normalized(phone).length<8)return reply({error:'Revisá el teléfono y código de reserva.'},400);
const base=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');if(!base||!key)return reply({error:'Consulta no disponible.'},503);
const query=new URLSearchParams({lookup_code:'eq.'+code.trim(),select:'city,starts_at,ends_at,customer_phone,selection,total_ars,deposit_ars,status',limit:'1'});
const res=await fetch(base+'/rest/v1/appointments?'+query,{headers:{apikey:key,Authorization:'Bearer '+key}});
if(!res.ok)return reply({error:'Consulta no disponible.'},503);
const rows=await res.json();const row=rows[0];if(!row||normalized(row.customer_phone)!==normalized(phone))return reply({error:'No encontramos una reserva con esos datos.'},404);
delete row.customer_phone;return reply({reservation:row});
}catch{return reply({error:'No se pudo consultar la reserva.'},400)}
});