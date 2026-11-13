"use strict";
// Fully isolated API regression tests: no network, no Firebase credentials, no production writes.
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const crypto=require("node:crypto");

function harness(file,initial={}){
  const records=new Map(Object.entries(initial).map(([k,v])=>[k,structuredClone(v)]));
  const writes=[];
  const fakeAdmin={
    apps:[{}],
    auth:()=>({verifyIdToken:async(token,checkRevoked)=>{
      assert.equal(checkRevoked,true);
      if(token==="revoked")throw Error("revoked");
      if(token==="admin-token")return {uid:"admin123456789012",email:"admin@example.test"};
      if(token==="student-token")return {uid:"student1234567890",email:"student@example.test"};
      throw Error("bad token");
    }}),
    firestore:()=>({
      doc:path=>({
        path,
        get:async()=>snapshot(path),
        set:async(data,opts)=>{writes.push(path);const old=records.get(path)||{};records.set(path,opts?.merge?{...old,...data}:data)},
        update:async(data)=>{writes.push(path);if(!records.has(path))throw Object.assign(Error("missing"),{code:5});apply(path,data)}
      }),
      runTransaction:async(fn)=>fn({
        get:async ref=>snapshot(ref.path),
        update:(ref,data)=>{writes.push(ref.path);apply(ref.path,data)}
      })
    })
  };
  function snapshot(path){return {path,exists:records.has(path),data:()=>records.get(path)}}
  function apply(path,patch){
    const value={...records.get(path)};
    for(const [k,v] of Object.entries(patch)){
      if(v?.__delete){delete value[k];continue}
      const bits=k.split(".");let target=value;
      for(const bit of bits.slice(0,-1))target=target[bit]??={};
      target[bits.at(-1)]=v;
    }
    records.set(path,value);
  }
  fakeAdmin.firestore.FieldValue={delete:()=>({__delete:true}),serverTimestamp:()=>({__timestamp:true})};
  const source=fs.readFileSync(file,"utf8");
  const module={exports:{}};
  const context={
    module,exports:module.exports,process:{env:{FIREBASE_SERVICE_ACCOUNT_JSON:"fake",VDOCIPHER_API_SECRET:"fake"}},
    require:id=>id==="firebase-admin"?fakeAdmin:require(id),
    console:{error:()=>{}},
    fetch:async()=>{throw Error("Unexpected external network request")},
    AbortSignal,JSON,Buffer,crypto
  };
  vm.runInNewContext(source,context,{filename:file,timeout:2000});
  async function request(body,method="POST",authorization){
    const req={method,body,headers:{authorization:authorization||""}};
    const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},status(code){this.statusCode=code;return this},json(value){this.body=value;return this}};
    await module.exports(req,res);
    return {status:res.statusCode,body:res.body};
  }
  return {request,records,writes};
}
const student="Students/student1234567890";
const adminPath="admins/admin123456789012";
const device="a".repeat(64),other="b".repeat(64);
const digest=x=>crypto.createHash("sha256").update(x).digest("hex");
const approved={role:"student",active:true};
const claim=(token,secret,action="claim")=>({idToken:token,deviceSecret:secret,action});
test("first approved device registers; same device works; second device rejected",async()=>{
 const h=harness("api/device.js",{[student]:approved});
 assert.equal((await h.request(claim("student-token",device))).status,200);
 assert.equal(h.records.get(student).deviceBinding,digest(device));
 assert.equal((await h.request(claim("student-token",device,"verify"))).status,200);
 const denied=await h.request(claim("student-token",other));
 assert.equal(denied.status,403);assert.equal(denied.body.error,"other_device");
 assert.equal(h.records.get(student).deviceBinding,digest(device));
});
test("inactive student and revoked Firebase token fail closed",async()=>{
 const h=harness("api/device.js",{[student]:{...approved,active:false}});
 assert.equal((await h.request(claim("student-token",device))).status,403);
 assert.equal((await h.request(claim("revoked",device))).status,401);
 assert.equal(h.writes.length,0);
});
test("only active admin can reset; new device can claim afterwards",async()=>{
 const h=harness("api/device.js",{[student]:{...approved,deviceBinding:digest(device)},[adminPath]:{active:true}});
 const reset={action:"reset",idToken:"student-token",studentUid:"student1234567890"};
 assert.equal((await h.request(reset)).status,403);
 assert.equal((await h.request({...reset,idToken:"admin-token"})).status,200);
 assert.equal(h.records.get(student).deviceBinding,undefined);
 assert.equal((await h.request(claim("student-token",other))).status,200);
 assert.equal(h.records.get(student).deviceBinding,digest(other));
});
test("playback rejects invalid token, suspended student, other device and locked lecture before provider call",async()=>{
 const catalog={"courseCatalog/batch1":{modules:[{lectures:[{id:"12345678-1234-1234-1234-123456789abc",releaseMode:"locked"}]}]}};
 const base={...catalog,[student]:{...approved,deviceBinding:digest(device)}};
 const input={idToken:"student-token",deviceSecret:device,moduleIndex:0,lectureIndex:0};
 let h=harness("api/playback.js",base);
 assert.equal((await h.request({...input,idToken:"revoked"})).status,401);
 assert.equal((await h.request({...input,deviceSecret:other})).status,403);
 assert.equal((await h.request(input)).body.error,"lecture_locked");
 h=harness("api/playback.js",{...base,[student]:{...approved,active:false,deviceBinding:digest(device)}});
 assert.equal((await h.request(input)).body.error,"student_not_approved");
});
test("video management rejects unauthenticated and non-admin requests",async()=>{
 const h=harness("api/admin-videos.js",{[student]:approved});
 assert.equal((await h.request(null,"GET")).status,401);
 assert.equal((await h.request(null,"GET","Bearer student-token")).status,403);
 assert.equal(h.writes.length,0);
});
