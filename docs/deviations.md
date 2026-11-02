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
| Concurrent users (NF-005) | 2,000 students, p90 within 3 s | Tested up to 2,000; passes at 500 (p90 948 ms), fails at 1,000+ (about 16% refused connections at 2,000) | Single laptop, in-memory storage; see PR #48 and backend/test-load.js. Not met on this setup |
