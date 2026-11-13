const {enforceRateLimit}=require("../lib/rate-limit");
// Admin-only student provisioning. Never expose service account credentials to the browser.
const crypto = require("node:crypto");
const admin = require("firebase-admin");
if (!admin.apps.length && process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  admin.initializeApp({credential:admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))});
}
const send=(res,status,body)=>res.status(status).json(body);
module.exports=async function handler(req,res){
  res.setHeader("Cache-Control","no-store, private");
  res.setHeader("Pragma","no-cache");
  if(req.method!=="POST")return send(res,405,{error:"method_not_allowed"});
  if(!admin.apps.length)return send(res,503,{error:"backend_not_configured"});
  const header=req.headers.authorization||"";
  if(!header.startsWith("Bearer "))return send(res,401,{error:"authentication_required"});
  let caller;
  try{caller=await admin.auth().verifyIdToken(header.slice(7),true)}
  catch{return send(res,401,{error:"invalid_session"})}
  try{
    const db=admin.firestore();
    if(!await enforceRateLimit(db,caller.uid,"create_student",res))return;
    const adminSnap=await db.doc("admins/"+caller.uid).get();
    if(!adminSnap.exists||adminSnap.data().active!==true)return send(res,403,{error:"admin_required"});
    const {name,email}=req.body||{};
    if(typeof name!=="string"||name.trim().length<2||name.trim().length>100||
       typeof email!=="string"||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return send(res,400,{error:"invalid_student_details"});
    const normalizedEmail=email.trim().toLowerCase();
    // Strong temporary credential, returned only once to the authorized admin.
    const temporaryPassword=crypto.randomBytes(24).toString("base64url");
    let created;
    try{created=await admin.auth().createUser({email:normalizedEmail,password:temporaryPassword,displayName:name.trim(),disabled:false})}
    catch(e){
      if(e.code==="auth/email-already-exists")return send(res,409,{error:"email_already_exists"});
      if(e.code==="auth/invalid-email")return send(res,400,{error:"invalid_student_details"});
      throw e;
    }
    try{
      await db.doc("Students/"+created.uid).create({
        name:name.trim(),email:normalizedEmail,role:"student",active:true,
        createdAt:admin.firestore.FieldValue.serverTimestamp(),
        createdBy:caller.uid,
        mustChangePassword:true,temporaryPasswordHash:crypto.createHash("sha256").update(temporaryPassword).digest("hex")
      });
    }catch(e){
      // Never leave an unapproved orphan account if Firestore provisioning fails.
      try{await admin.auth().deleteUser(created.uid)}
      catch(cleanupError){
        console.error("Student provisioning rollback failed for UID:",created.uid,cleanupError?.code);
        return send(res,500,{error:"provisioning_incomplete_contact_admin",uid:created.uid});
      }
      return send(res,500,{error:"student_approval_failed"});
    }
    return send(res,201,{ok:true,uid:created.uid,email:normalizedEmail,name:name.trim(),temporaryPassword});
  }catch(e){
    console.error("Student provisioning error:",e?.code||e?.message);
    return send(res,500,{error:"student_creation_failed"});
  }
};
