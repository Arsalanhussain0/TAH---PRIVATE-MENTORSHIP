const {enforceRateLimit}=require("../lib/rate-limit");
// Secure VdoCipher playback endpoint. Not enabled until VDOCIPHER_API_SECRET
// and private video mapping are configured. Never trust client-supplied video IDs.
const crypto=require("node:crypto");
const admin=require("firebase-admin");
if(!admin.apps.length && process.env.FIREBASE_SERVICE_ACCOUNT_JSON){
  admin.initializeApp({credential:admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))});
}
const respond=(res,status,body)=>res.status(status).json(body);
module.exports=async function handler(req,res){
  res.setHeader("Cache-Control","no-store, private");
  res.setHeader("Pragma","no-cache");
  if(req.method!=="POST")return respond(res,405,{error:"method_not_allowed"});
  if(!admin.apps.length)return respond(res,503,{error:"backend_not_configured"});
  if(!process.env.VDOCIPHER_API_SECRET)return respond(res,503,{error:"video_service_not_configured"});
  const {idToken,deviceSecret,moduleIndex,lectureIndex}=req.body||{};
  if(typeof idToken!=="string"||idToken.length>10000||typeof deviceSecret!=="string"||!/^[a-f0-9]{64}$/.test(deviceSecret))
    return respond(res,401,{error:"authentication_required"});
  if(!Number.isInteger(moduleIndex)||moduleIndex<0||moduleIndex>=50||!Number.isInteger(lectureIndex)||lectureIndex<0||lectureIndex>=100)
    return respond(res,400,{error:"invalid_lecture"});
  let user;
  try{user=await admin.auth().verifyIdToken(idToken,true)}
  catch{return respond(res,401,{error:"invalid_session"})}
  try{
    const db=admin.firestore();
    if(!await enforceRateLimit(db,user.uid,"playback",res))return;
    const [studentSnap,catalogSnap,videoSnap]=await Promise.all([
      db.doc("Students/"+user.uid).get(),
      db.doc("courseCatalog/batch1").get(),
      db.doc("privateVideoMap/batch1").get()
    ]);
    const student=studentSnap.data();
    if(!studentSnap.exists||student?.active!==true||student?.role!=="student")return respond(res,403,{error:"student_not_approved"});
    if(student.mustChangePassword===true)return respond(res,403,{error:"password_change_required"});
    const hash=crypto.createHash("sha256").update(deviceSecret).digest("hex");
    if(!student.deviceBinding||student.deviceBinding!==hash)return respond(res,403,{error:"device_not_authorized"});
    const lecture=catalogSnap.data()?.modules?.[moduleIndex]?.lectures?.[lectureIndex];
    if(!lecture)return respond(res,404,{error:"lecture_not_found"});
    if(lecture.releaseMode==="locked")return respond(res,403,{error:"lecture_locked"});
    // Keep IDs server-side. Only authenticated admins can provision mapping.
    const videoId=lecture.id && videoSnap.data()?.videos?.[lecture.id];
    if(typeof videoId!=="string"||!/^[a-zA-Z0-9_-]{8,64}$/.test(videoId))
      return respond(res,404,{error:"video_not_uploaded"});
    const watermark=(user.email||user.uid).replace(/[\r\n\[\]{}'"]/g," ").slice(0,120);
    const annotate=JSON.stringify([{type:"rtext",text:watermark,alpha:"0.55",color:"0xFFFFFF",size:"15",interval:"5000",skip:"1000"}]);
    const upstream=await fetch("https://dev.vdocipher.com/api/videos/"+encodeURIComponent(videoId)+"/otp",{
      method:"POST",
      headers:{"Authorization":"Apisecret "+process.env.VDOCIPHER_API_SECRET,"Content-Type":"application/json","Accept":"application/json"},
      body:JSON.stringify({ttl:300,annotate}),
      signal:AbortSignal.timeout(10000)
    });
    if(!upstream.ok)return respond(res,502,{error:"video_provider_unavailable"});
    const data=await upstream.json();
    if(typeof data.otp!=="string"||typeof data.playbackInfo!=="string")return respond(res,502,{error:"invalid_video_provider_response"});
    return respond(res,200,{otp:data.otp,playbackInfo:data.playbackInfo});
  }catch(e){console.error("Playback request failed:",e?.message);return respond(res,500,{error:"playback_unavailable"})}
};
