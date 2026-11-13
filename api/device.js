const {enforceRateLimit}=require("../lib/rate-limit");
// TAH server-side device binding. Requires FIREBASE_SERVICE_ACCOUNT_JSON in Vercel.
const crypto = require("node:crypto");
const admin = require("firebase-admin");
if (!admin.apps.length) {
  // Never expose this secret to the browser or commit it to Git.
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    admin.initializeApp({credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))});
  }
}
const hash = value => crypto.createHash("sha256").update(value).digest("hex");
const reply = (res, status, data) => res.status(status).json(data);
module.exports = async function handler(req,res) {
  res.setHeader("Cache-Control","no-store");
  if (req.method !== "POST") return reply(res,405,{error:"method_not_allowed"});
  if (!admin.apps.length) return reply(res,503,{error:"device_service_not_configured"});
  const {idToken,deviceSecret,action,studentUid} = req.body || {};
  if (typeof idToken!=="string" || idToken.length>10000) return reply(res,401,{error:"authentication_required"});
  let user;
  try { user=await admin.auth().verifyIdToken(idToken,true); }
  catch { return reply(res,401,{error:"invalid_session"}); }
  const db=admin.firestore();
  if(!await enforceRateLimit(db,user.uid,action==="reset"?"device_reset":action==="claim"?"device_claim":"device_verify",res))return;
  if (action==="reset") {
    const a=await db.doc("admins/"+user.uid).get();
    if (!a.exists || a.data().active!==true) return reply(res,403,{error:"admin_required"});
    if (typeof studentUid!=="string" || !/^[A-Za-z0-9_-]{15,128}$/.test(studentUid)) return reply(res,400,{error:"invalid_student_uid"});
    const ref=db.doc("Students/"+studentUid);
    await db.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      if (!snap.exists) throw Object.assign(new Error("not_found"),{status:404});
      tx.update(ref,{deviceBinding:admin.firestore.FieldValue.delete(),deviceResetAt:admin.firestore.FieldValue.serverTimestamp()});
    }).catch(e=>{throw e});
    return reply(res,200,{ok:true});
  }
  if (action!=="claim" && action!=="verify") return reply(res,400,{error:"invalid_action"});
  if (typeof deviceSecret!=="string" || !/^[a-f0-9]{64}$/.test(deviceSecret)) return reply(res,400,{error:"invalid_device_token"});
  const ref=db.doc("Students/"+user.uid);
  const deviceHash=hash(deviceSecret);
  try {
    const outcome=await db.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      if (!snap.exists || snap.data().active!==true || snap.data().role!=="student") return "not_approved";
      const binding=snap.data().deviceBinding;
      if (!binding) {
        if (action!=="claim") return "not_registered";
        tx.update(ref,{deviceBinding:deviceHash,deviceRegisteredAt:admin.firestore.FieldValue.serverTimestamp()});
        return "registered";
      }
      return binding===deviceHash ? "approved" : "other_device";
    });
    if (outcome==="registered" || outcome==="approved") return reply(res,200,{ok:true,status:outcome});
    return reply(res,403,{ok:false,error:outcome});
  } catch(e) {
    return reply(res,500,{error:"device_check_failed"});
  }
};
