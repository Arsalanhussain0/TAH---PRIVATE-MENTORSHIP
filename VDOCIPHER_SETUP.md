# TAH VdoCipher integration (preparation only)

## Current status
- `api/playback.js` is added, but student UI is NOT wired to it and no VdoCipher account is required yet.
- Missing `VDOCIPHER_API_SECRET` causes HTTP 503. No insecure video fallback is allowed.
- Existing lecture titles and manual lock/unlock stay unchanged.

## Required before launch
1. Set `VDOCIPHER_API_SECRET` as a sensitive server-only Vercel environment variable (never share in chat, GitHub, or frontend).
2. Upload videos to VdoCipher and obtain their video IDs.
3. Populate `privateVideoMap/batch1` **only using a trusted Firebase Admin SDK process**. Format:
   `{modules:[{lectures:["VIDEO_ID_1","VIDEO_ID_2"]}, ...]}`.
   Never expose this document in Firestore client rules. Deny all client reads/writes to `privateVideoMap/{doc}`.
4. IMPORTANT: The current positional module/lecture mapping is provisional. Implement stable immutable IDs for modules/lectures before allowing reorder or deletion in production, otherwise a video could be linked to the wrong lecture.
5. Wire student UI to POST `/api/playback` with Firebase ID token, browser device secret, moduleIndex and lectureIndex; create player iframe using returned `otp` and `playbackInfo` only.
6. Test active/suspended, registered/other-device, locked/unlocked, missing video, expired token, API outage and revocation. Do not launch until these pass.
7. Add rate limiting and abuse monitoring before production. Use a short OTP TTL; it does not terminate an already-started playback session immediately.
8. Check the actual deployed Firestore rules (client users must not edit video mappings or device binding). Client-side locks are not sufficient.

VdoCipher docs: https://www.vdocipher.com/docs/server/playbackauth/otp/

DRM can reduce capture on supported devices, but websites cannot guarantee screenshot or external camera blocking.
