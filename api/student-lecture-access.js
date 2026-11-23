const admin = require("firebase-admin");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, private");
  if (req.method !== "POST") return res.status(405).json({error: "method_not_allowed"});
  if (!admin.apps.length && process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    admin.initializeApp({credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))});
  }
  if (!admin.apps.length) return res.status(503).json({error: "backend_not_configured"});
  // Shared production student records cannot be edited from a preview deployment.
  if (process.env.VERCEL_ENV !== "production") return res.status(403).json({error: "preview_is_read_only"});
  const token = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
  if (!token || token.length > 10000) return res.status(401).json({error: "authentication_required"});
  let caller;
  try {
    caller = await admin.auth().verifyIdToken(token, true);
  } catch {
    return res.status(401).json({error: "invalid_session"});
  }
  const {uid, lectureId, mode} = req.body || {};
  if (typeof uid !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(uid) ||
      typeof lectureId !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(lectureId) ||
      !["default", "allow", "deny"].includes(mode)) {
    return res.status(400).json({error: "invalid_selection"});
  }
  const db = admin.firestore();
  try {
    const status = await db.runTransaction(async transaction => {
      const student = db.collection("Students").doc(uid);
      const [actor, record, catalog] = await transaction.getAll(
        db.collection("admins").doc(caller.uid), student, db.doc("courseCatalog/batch1")
      );
      if (actor.data()?.active !== true) return 403;
      if (record.data()?.role !== "student") return 404;
      const matches = (catalog.data()?.modules || []).flatMap(node => node.lectures || [])
        .filter(lecture => lecture.id === lectureId);
      if (mode !== "default" && matches.length !== 1) return 404;
      const overrides = {...record.data().lectureAccess};
      if (mode === "default") delete overrides[lectureId];
      else Object.defineProperty(overrides, lectureId, {value: mode === "allow", enumerable: true, configurable: true});
      transaction.update(student, {lectureAccess: overrides});
      return 200;
    });
    return res.status(status).json(status === 200 ? {ok: true} :
      {error: status === 403 ? "admin_required" : "student_or_lecture_not_found"});
  } catch {
    return res.status(500).json({error: "lecture_access_update_failed"});
  }
};
