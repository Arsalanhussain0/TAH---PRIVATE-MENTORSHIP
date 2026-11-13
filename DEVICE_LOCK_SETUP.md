# TAH strict device lock — backend preparation

The server endpoint `/api/device` is deployed separately from the static student portal. It requires `FIREBASE_SERVICE_ACCOUNT_JSON` as a **server-only** Vercel environment variable. Set it to the full Firebase service-account JSON from a trusted administrator environment. Never commit, paste into chat, or expose it in frontend code.

The endpoint checks Firebase ID tokens with revocation checking and uses a Firestore transaction to atomically bind the first approved student login to a random 256-bit browser token (only its SHA-256 digest is stored). Subsequent claims with another token are rejected. Admin reset requires an active `admins/{uid}` record and deletes the binding.

**Not yet activated:** The existing student portal does not call this endpoint, and the admin dashboard does not yet expose a reset button. Do not claim device locking is enforced until frontend integration, rules and end-to-end tests are completed.

**Limitations:** This binds a browser installation, not a physical device. Clearing browser data requires an admin reset; a stolen/copied browser token may impersonate the same device. Real video authorization must validate the device binding on every protected video playback request. Firestore rules must prohibit students from modifying `deviceBinding` and `deviceResetAt`; admins should reset via the authenticated server endpoint.
