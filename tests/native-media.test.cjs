const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'alejandrino-media-'));
fs.symlinkSync(path.join(root, 'node_modules'), path.join(temp, 'node_modules'), 'junction');
for (const name of ['native-protocol','native-media-protocol','native-media-client','native-authorize.server']) {
  fs.writeFileSync(path.join(temp, name+'.js'), ts.transpileModule(fs.readFileSync(path.join(root,'app/lib',name+'.ts'),'utf8'),
    {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText);
}
test.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
const {downloadSource}=require(path.join(temp,'native-media-protocol.js'));
const {authorizeNativeCheck}=require(path.join(temp,'native-authorize.server.js'));
const {NativeMediaClient}=require(path.join(temp,'native-media-client.js'));
const input={userId:'123e4567-e89b-42d3-a456-426614174000',techniqueId:'019321ab-cdef-7abc-8def-0123456789ab',accessToken:'synthetic.test.token'};
const request={protocolVersion:1,type:'DOWNLOAD',requestId:'550e8400-e29b-41d4-a716-446655440000',userId:input.userId,techniqueId:input.techniqueId};
const source='https://www.instagram.com/reel/OwnedClip/';
function db(row) {
  const query={select:()=>query,eq:()=>query,maybeSingle:async()=>({data:row,error:null})};
  return ()=>({auth:{getUser:async()=>({data:{user:{id:input.userId}},error:null})},from:()=>query});
}
function http(body) { return new Request('https://app.example/api/native/authorize',{method:'POST',headers:{Authorization:'Bearer '+input.accessToken},body:JSON.stringify(body)}); }
test('DOWNLOAD solo autoriza la URL de la ficha propia y descarta la URL enviada por JavaScript',async()=>{
  const response=await authorizeNativeCheck(http({...request,sourceUrl:'https://www.instagram.com/reel/Injected/'}),
    db({id:input.techniqueId,user_id:input.userId,url:source+'?igsh=tracking'}));
  assert.equal(response.status,200);
  const result=await response.json();
  assert.equal(result.sourceUrl,source); assert.equal(result.action,'DOWNLOAD');
  assert.equal(result.type,'AUTHORIZED'); assert.ok(!JSON.stringify(result).includes(input.accessToken));
  assert.equal((await authorizeNativeCheck(http(request),db({id:input.techniqueId,user_id:crypto.randomUUID(),url:source}))).status,404);
});
test('OPEN requiere propiedad pero no revela la URL ni modifica la ficha',async()=>{
  const response=await authorizeNativeCheck(http({...request,type:'OPEN'}),db({id:input.techniqueId,user_id:input.userId,url:source}));
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{...request,type:'AUTHORIZED',action:'OPEN'});
});
test('rechaza fuentes ajenas, credenciales, puertos, rutas y redirecciones genéricas',async()=>{
  for (const url of ['http://www.instagram.com/reel/x/','https://www.instagram.com.evil.example/reel/x/',
    'https://user:pass@www.instagram.com/reel/x/','https://www.instagram.com:8443/reel/x/',
    'https://127.0.0.1/reel/x/','https://www.instagram.com/','https://www.tiktok.com/redirect',
    'https://www.instagram.com/reel/x/\\bad','https://www.instagram.com/reel/x/\n']) assert.equal(downloadSource(url),null,url);
  const response=await authorizeNativeCheck(http(request),db({id:input.techniqueId,user_id:input.userId,url:'https://youtube.com/watch?v=example'}));
  assert.equal(response.status,422); assert.equal((await response.json()).errorCode,'SOURCE_UNSUPPORTED');
  assert.equal(downloadSource('https://vm.tiktok.com/Example/?x=1'),'https://vm.tiktok.com/Example/');
});
function transport(timeout=1000) {
 const sent=[]; const bridge={onmessage:null,postMessage:s=>sent.push(JSON.parse(s))};
 const client=new NativeMediaClient(bridge,timeout);
 const reply=(request,data)=>bridge.onmessage({data:JSON.stringify({...request,accessToken:undefined,action:request.type,...data})});
 return {sent,client,reply};
}
test('progreso, resultado y apertura quedan correlacionados; no devuelve rutas al cliente',async()=>{
 const t=transport(), stages=[];
 const promise=t.client.run('DOWNLOAD',input,new AbortController().signal,s=>stages.push(s));
 const req=t.sent[0];
 t.reply(req,{type:'PROGRESS',stage:'downloading'});t.reply(req,{type:'PROGRESS',stage:'merging'});
 t.reply(req,{type:'AVAILABLE',width:720,height:1280,uri:'content://media/private'});
 assert.deepEqual(await promise,{type:'AVAILABLE',width:720,height:1280});
 assert.deepEqual(stages,['downloading','merging']);
 const open=t.client.run('OPEN',input,new AbortController().signal,()=>{});
 t.reply(t.sent[1],{type:'OPENED'}); assert.deepEqual(await open,{type:'OPENED'});
});
test('cancelar cuenta o agotar tiempo cancela el trabajo nativo y descarta resultados tardíos',async()=>{
 for (const timeout of [true,false]) {
  const t=transport(timeout?5:1000), controller=new AbortController();
  const p=t.client.run('DOWNLOAD',input,controller.signal,()=>assert.fail('No late progress'));
  const rejected=assert.rejects(p,e=>e.code===(timeout?'TIMEOUT':'CANCELLED'));
  if (!timeout) controller.abort();
  await rejected;
  assert.equal(t.sent[1].type,'CANCEL');assert.equal(t.sent[1].requestId,t.sent[0].requestId);
  assert.ok(!('accessToken' in t.sent[1]));
  t.reply(t.sent[0],{type:'PROGRESS',stage:'saving'});t.reply(t.sent[0],{type:'AVAILABLE'});
 }
});
test('rechaza respuestas de otra cuenta o acción y limita tareas simultáneas',async()=>{
 for (const changed of [{userId:crypto.randomUUID()},{action:'OPEN'},{protocolVersion:2}]) {
  const t=transport(); const p=t.client.run('DOWNLOAD',input,new AbortController().signal,()=>assert.fail());
  t.reply(t.sent[0],{type:'AVAILABLE',...changed}); await assert.rejects(p,e=>e.code==='BAD_RESPONSE');
  assert.equal(t.sent[1].type,'CANCEL');
 }
 const t=transport(), c=new AbortController(); const first=t.client.run('DOWNLOAD',input,c.signal,()=>{});
 const rejected=assert.rejects(first,e=>e.code==='CANCELLED');
 await assert.rejects(t.client.run('DOWNLOAD',input,c.signal,()=>{}),e=>e.code==='BUSY'); c.abort(); await rejected;
});

test('comunica causas de descarga acotadas y distingue originales sin audio', async () => {
 for (const code of ['PROVIDER_ACCESS_REQUIRED','PROVIDER_RATE_LIMITED','PROVIDER_UNAVAILABLE',
   'DOWNLOAD_NETWORK_FAILED','FORMAT_UNAVAILABLE','FILE_TOO_LARGE']) {
  const t=transport(), p=t.client.run('DOWNLOAD',input,new AbortController().signal,()=>{});
  t.reply(t.sent[0],{type:'ERROR',errorCode:code,message:'private provider details'});
  await assert.rejects(p,e=>e.code===code && !e.message.includes('private'));
 }
 const t=transport(), p=t.client.run('DOWNLOAD',input,new AbortController().signal,()=>{});
 t.reply(t.sent[0],{type:'AVAILABLE',width:720,height:1280,hasAudio:false});
 assert.deepEqual(await p,{type:'AVAILABLE',width:720,height:1280,hasAudio:false});
});
