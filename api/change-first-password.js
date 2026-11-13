const {enforceRateLimit}=require("../lib/rate-limit");
const crypto=require("node:crypto");
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
 let user;
 try{user=await admin.auth().verifyIdToken(authorization.slice(7),true)}
 catch{return send(res,401,{error:"invalid_session"})}
 if(!user.auth_time||Math.abs(Date.now()/1000-user.auth_time)>300)
   return send(res,401,{error:"recent_login_required"});
 const password=req.body?.newPassword;
 if(typeof password!=="string"||password.length<12||password.length>128||
    !/[a-z]/.test(password)||!/[A-Z]/.test(password)||!/[0-9]/.test(password))
   return send(res,400,{error:"password_needs_12_chars_upper_lower_number"});
 const db=admin.firestore(),ref=db.doc("Students/"+user.uid);
 if(!await enforceRateLimit(db,user.uid,"change_first_password",res))return;
 try{
  const snap=await ref.get(),record=snap.data();
  if(!snap.exists||record.active!==true||record.role!=="student")return send(res,403,{error:"student_not_approved"});
  if(record.mustChangePassword!==true)return send(res,409,{error:"password_change_not_required"});
  const hash=crypto.createHash("sha256").update(password).digest("hex");
  if(record.temporaryPasswordHash===hash)return send(res,400,{error:"choose_different_password"});
  await admin.auth().updateUser(user.uid,{password});
  await ref.update({mustChangePassword:false,temporaryPasswordHash:admin.firestore.FieldValue.delete(),passwordChangedAt:admin.firestore.FieldValue.serverTimestamp()});
  return send(res,200,{ok:true});
 }catch(e){
  console.error("First-login password change failed:",e?.code||e?.message);
  return send(res,500,{error:"password_change_failed_contact_admin"});
 }
};
