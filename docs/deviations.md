# Deviations from SRS / SAD / Test Plan

| Item | Documented | What we did | Why |
|---|---|---|---|
| Profile and applications storage | PostgreSQL | In-memory stores (data resets on restart) | Faster for Sprint 1, same approach as drives |
| Eligible drives route | GET /api/drives?studentId | GET /api/drives/eligible | GET /api/drives is the TPO list; student id comes from the token |
| Dev token script | Login issues JWT | backend/make-token.js creates test tokens | Used to test before login (F-002) was merged |
| Users storage | PostgreSQL | In-memory store (backend/data/usersStore.js) | Same Sprint 1 in-memory approach as drives, profiles, and applications |
| Email / OTP delivery | Transactional email service / SMTP | In-memory OTP + console.log output (5 min expiry) | No live email service configured for Sprint 1; OTP logged to server console for testing |
