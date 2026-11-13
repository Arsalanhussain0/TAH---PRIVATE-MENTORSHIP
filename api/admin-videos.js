const {enforceRateLimit}=require("../lib/rate-limit");
// Admin-only VdoCipher video mapping. IDs never enter the public course catalog.
const admin=require("firebase-admin");
if(!admin.apps.length&&process.env.FIREBASE_SERVICE_ACCOUNT_JSON){
 admin.initializeApp({credential:admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))});
}
const send=(r,s,b)=>r.status(s).json(b);
module.exports=async(req,res)=>{
 res.setHeader("Cache-Control","no-store, private");
 if(!["GET","POST"].includes(req.method))return send(res,405,{error:"method_not_allowed"});
 if(!admin.apps.length)return send(res,503,{error:"backend_not_configured"});
 const header=req.headers.authorization||"";
 if(!header.startsWith("Bearer "))return send(res,401,{error:"authentication_required"});
 let user;
 try{user=await admin.auth().verifyIdToken(header.slice(7),true)}
 catch{return send(res,401,{error:"invalid_session"})}
 const db=admin.firestore();
 if(!await enforceRateLimit(db,user.uid,req.method==="GET"?"admin_videos_get":"admin_videos_post",res))return;
 try{
  const a=await db.doc("admins/"+user.uid).get();
  if(!a.exists||a.data().active!==true)return send(res,403,{error:"admin_required"});
  const ref=db.doc("privateVideoMap/batch1");
  if(req.method==="GET"){
   const snap=await ref.get();
   // Admin only: return status, not secret IDs, until an edit is requested.
   return send(res,200,{videos:Object.keys(snap.data()?.videos||{})});
  }
  const {lectureId,videoId}=req.body||{};
  if(typeof lectureId!=="string"||!/^[a-f0-9-]{36}$/.test(lectureId))
   return send(res,400,{error:"invalid_lecture_id"});
  if(typeof videoId!=="string"||(videoId!==""&&!/^[A-Za-z0-9_-]{8,64}$/.test(videoId)))
   return send(res,400,{error:"invalid_video_id"});
  const catalog=await db.doc("courseCatalog/batch1").get();
  const found=(catalog.data()?.modules||[]).some(m=>(m.lectures||[]).some(l=>l.id===lectureId));
  if(!found)return send(res,404,{error:"lecture_not_found"});
  if(videoId)await ref.set({videos:{[lectureId]:videoId}},{merge:true});
  else await ref.update({["videos."+lectureId]:admin.firestore.FieldValue.delete()}).catch(e=>{if(e.code!==5)throw e});
  return send(res,200,{ok:true,linked:!!videoId});
 }catch(e){console.error("video admin error",e?.message);return send(res,500,{error:"video_management_failed"})}
};
