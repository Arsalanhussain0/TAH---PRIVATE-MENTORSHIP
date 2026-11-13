"use strict";
// Distributed fixed-window limiter backed by Firestore transactions.
// Runs after Firebase token verification; never trusts caller-supplied IP headers.
// Documents are opaque hashes, not emails or raw Firebase UIDs.
const crypto=require("node:crypto");
const LIMITS=Object.freeze({
 device_claim:12,device_verify:120,device_reset:12,
 playback:90,create_student:15,delete_student:10,
 change_first_password:8,student_reset_email:20,
 admin_videos_get:90,admin_videos_post:30
});
async function enforceRateLimit(db,uid,action,res){
 const limit=LIMITS[action];
 if(!limit||typeof uid!=="string"||!uid)throw Error("invalid_rate_limit_configuration");
 const seconds=60;
 const now=Date.now();
 const windowId=Math.floor(now/(seconds*1000));
 const digest=crypto.createHash("sha256").update(action+"\0"+uid).digest("hex");
 const ref=db.doc("apiRateLimits/"+digest+"_"+windowId);
 const retryAfter=Math.max(1,Math.ceil(((windowId+1)*seconds*1000-now)/1000));
 try{
  const allowed=await db.runTransaction(async tx=>{
   const snap=await tx.get(ref);
   const count=snap.exists ? snap.data().count : 0;
   if(!Number.isSafeInteger(count)||count<0)return false;
   if(count>=limit)return false;
   tx.set(ref,{count:count+1,expiresAt:new Date((windowId+2)*seconds*1000)});
   return true;
  });
  if(!allowed){
   res.setHeader("Retry-After",String(retryAfter));
   res.status(429).json({error:"rate_limit_exceeded",retryAfterSeconds:retryAfter});
  }
  return allowed;
 }catch(err){
  console.error("Rate limit storage unavailable:",err?.code||err?.message);
  res.status(503).json({error:"rate_limit_service_unavailable"});
  return false;
 }
}
module.exports={enforceRateLimit,LIMITS};
