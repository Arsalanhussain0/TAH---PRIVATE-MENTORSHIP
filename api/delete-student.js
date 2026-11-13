const {enforceRateLimit}=require("../lib/rate-limit");
// Admin-only permanent student deletion. Requires FIREBASE_SERVICE_ACCOUNT_JSON.
const admin=require("firebase-admin");
if(!admin.apps.length&&process.env.FIREBASE_SERVICE_ACCOUNT_JSON){
 admin.initializeApp({credential:admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))});
}
const send=(res,status,data)=>res.status(status).json(data);
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
 if(typeof uid!=="string"||!/^[A-Za-z0-9_-]{15,128}$/.test(uid))
  return send(res,400,{error:"invalid_student_uid"});
 if(uid===caller.uid)return send(res,403,{error:"cannot_delete_self"});
 try{
  const db=admin.firestore();
  if(!await enforceRateLimit(db,caller.uid,"delete_student",res))return;
  const adminSnap=await db.doc("admins/"+caller.uid).get();
  if(!adminSnap.exists||adminSnap.data().active!==true)return send(res,403,{error:"admin_required"});
  // Never delete admin accounts through the student management interface.
  const targetAdmin=await db.doc("admins/"+uid).get();
  if(targetAdmin.exists)return send(res,403,{error:"cannot_delete_admin"});
  const ref=db.doc("Students/"+uid);
  const studentSnap=await ref.get();
  if(!studentSnap.exists||studentSnap.data().role!=="student")return send(res,404,{error:"student_not_found"});
  // Deny Firestore access first; a partially failed deletion stays suspended.
  await ref.update({active:false});
  try{
   await admin.auth().updateUser(uid,{disabled:true});
   await admin.auth().revokeRefreshTokens(uid);
  }catch(e){
   if(e.code!=="auth/user-not-found")throw e;
  }
  // Keep the suspended Firestore record until Authentication deletion succeeds.
  try{await admin.auth().deleteUser(uid)}
  catch(e){if(e.code!=="auth/user-not-found")throw e}
  await ref.delete();
  return send(res,200,{ok:true});
 }catch(e){
  console.error("Student deletion failed:",e?.code||e?.message);
  return send(res,500,{error:"student_deletion_incomplete_contact_admin"});
 }
};
