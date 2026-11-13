const {enforceRateLimit}=require("../lib/rate-limit");
// Admin-only lookup of a student's Firebase Authentication email.
// The browser uses Firebase's standard password reset email delivery.
const admin=require("firebase-admin");
if(!admin.apps.length&&process.env.FIREBASE_SERVICE_ACCOUNT_JSON){
 admin.initializeApp({credential:admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))});
}
const send=(res,status,body)=>res.status(status).json(body);
module.exports=async(req,res)=>{
 res.setHeader("Cache-Control","no-store, private");
 if(req.method!=="POST")return send(res,405,{error:"method_not_allowed"});
 if(!admin.apps.length)return send(res,503,{error:"backend_not_configured"});
 const authorization=req.headers.authorization||"";
 if(!authorization.startsWith("Bearer "))return send(res,401,{error:"authentication_required"});
 let caller;
 try{caller=await admin.auth().verifyIdToken(authorization.slice(7),true)}
 catch{return send(res,401,{error:"invalid_session"})}
 const uid=req.body?.studentUid;
 if(typeof uid!=="string"||!/^[A-Za-z0-9_-]{15,128}$/.test(uid))return send(res,400,{error:"invalid_student_uid"});
 try{
  const db=admin.firestore();
  if(!await enforceRateLimit(db,caller.uid,"student_reset_email",res))return;
  const adminSnap=await db.doc("admins/"+caller.uid).get();
  if(!adminSnap.exists||adminSnap.data().active!==true)return send(res,403,{error:"admin_required"});
  const studentSnap=await db.doc("Students/"+uid).get();
  if(!studentSnap.exists||studentSnap.data().role!=="student")return send(res,404,{error:"student_not_found"});
  const targetAdmin=await db.doc("admins/"+uid).get();
  if(targetAdmin.exists)return send(res,403,{error:"admin_account_not_allowed"});
  let account;
  try{account=await admin.auth().getUser(uid)}
  catch(e){if(e.code==="auth/user-not-found")return send(res,404,{error:"authentication_account_not_found"});throw e}
  if(!account.email)return send(res,409,{error:"student_email_not_available"});
  return send(res,200,{ok:true,email:account.email});
 }catch(e){
  console.error("Password reset email lookup failed:",e?.code||e?.message);
  return send(res,500,{error:"student_lookup_failed"});
 }
};
