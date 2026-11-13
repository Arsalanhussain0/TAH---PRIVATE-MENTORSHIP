"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {enforceRateLimit,LIMITS}=require("../lib/rate-limit");
function fixture(fail=false){
 const docs=new Map();
 const db={doc:path=>({path}),runTransaction:async fn=>{
  if(fail)throw Error("Firestore unavailable");
  const writes=[];
  const tx={
   get:async ref=>({exists:docs.has(ref.path),data:()=>docs.get(ref.path)}),
   set:(ref,data)=>writes.push([ref.path,data])
  };
  const outcome=await fn(tx);
  for(const [path,data] of writes)docs.set(path,data);
  return outcome;
 }};
 function res(){return {statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},status(s){this.statusCode=s;return this},json(v){this.body=v;return this}}}
 return {db,res,docs};
}
test("limit is enforced after the configured number of requests",async()=>{
 const h=fixture(),limit=LIMITS.create_student;
 for(let i=0;i<limit;i++)assert.equal(await enforceRateLimit(h.db,"admin-uid","create_student",h.res()),true);
 const response=h.res();
 assert.equal(await enforceRateLimit(h.db,"admin-uid","create_student",response),false);
 assert.equal(response.statusCode,429);
 assert.equal(response.body.error,"rate_limit_exceeded");
 assert.ok(Number(response.headers["Retry-After"])>=1);
});
test("different users and actions get independent buckets",async()=>{
 const h=fixture();
 for(let i=0;i<LIMITS.delete_student;i++)await enforceRateLimit(h.db,"admin-uid","delete_student",h.res());
 assert.equal(await enforceRateLimit(h.db,"other-uid","delete_student",h.res()),true);
 assert.equal(await enforceRateLimit(h.db,"admin-uid","create_student",h.res()),true);
});
test("database failures deny requests rather than disabling rate limiting",async()=>{
 const h=fixture(true),response=h.res();
 assert.equal(await enforceRateLimit(h.db,"uid","playback",response),false);
 assert.equal(response.statusCode,503);
});
