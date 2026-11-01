# Deviations from SRS / SAD / Test Plan

| Item | Documented | What we did | Why |
|---|---|---|---|
| Profile and applications storage | PostgreSQL | In-memory stores (data resets on restart) | Faster for Sprint 1, same approach as drives |
| Eligible drives route | GET /api/drives?studentId | GET /api/drives/eligible | GET /api/drives is the TPO list; student id comes from the token |
| Dev token script | Login issues JWT | backend/make-token.js creates test tokens | Used to test before login (F-002) was merged |
| Resume storage | Cloud object storage | Resumes kept in server memory (lost on restart) | Faster for Sprint 2, same approach as other stores |
| Users storage | PostgreSQL | In-memory store (backend/data/usersStore.js) | Same Sprint 1 in-memory approach as drives, profiles, and applications |
| Email / OTP delivery | Transactional email service / SMTP | In-memory OTP + console.log output (5 min expiry) | No live email service configured for Sprint 1; OTP logged to server console for testing |
| Resume template | Template saved with the profile | JSON template built from the profile; adjusted version kept in memory | Faster for Sprint 2; PDF export not built |
| Sensitive values in logs (NF-003) | Passwords, tokens and OTPs never logged | Dev-only OTP printed to the server console | No email service yet; everything else checked by backend/test-no-plaintext.js |
| Front end | React single-page app | Plain accessible HTML/JS page served by Express (backend/public/index.html) | Faster for Sprint 2; same REST API |
| Password reset email (F-003) | Reset link sent to institutional email via transactional SMTP | In dev mode the reset link is printed to the server console prefixed `[EMAIL DEV]`; the raw token is NOT stored in plaintext and is NOT returned in API responses. Production SMTP requires `EMAIL_PROVIDER` + `SMTP_*` env vars — see `backend/utils/emailService.js`. | No live SMTP service available in Sprint 2 development environment |
| Password reset token storage (F-003) | Tokens stored securely | Only the SHA-256 digest of each reset token is stored in the in-memory map; the raw token travels exclusively inside the HTTPS reset URL | Follows same in-memory approach as OTP; satisfies AC-003 "store only a cryptographic hash" |
