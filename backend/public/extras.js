document.head.insertAdjacentHTML('beforeend', '<style>pre{border:1px solid #767676;padding:.5rem;white-space:pre-wrap}select{padding:.5rem;font-size:1rem;border:2px solid #767676;border-radius:4px;display:block}ul{padding-left:1.2rem}</style>');

function sec(parent, id, title, html) {
  const s = document.createElement('section');
  s.setAttribute('aria-labelledby', id + '-h');
  s.innerHTML = '<h2 id="' + id + '-h">' + title + '</h2>' + html;
  $(parent).appendChild(s);
}
function authFetch(path, opts) {
  opts = opts || {};
  opts.headers = Object.assign({ Authorization: 'Bearer ' + token }, opts.headers || {});
  return fetch('/api' + path, opts);
}
function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}
function fill(ul, items, empty) {
  ul.textContent = '';
  (items.length ? items : [empty]).forEach((t) => {
    const li = document.createElement('li');
    li.textContent = t;
    ul.appendChild(li);
  });
}
function onClick(id, fn) {
  $(id).addEventListener('click', async () => {
    try { await fn(); } catch (err) { say(err.message, 'err'); }
  });
}

// ---- Register with OTP (signed-out screen) ----
$('login-section').insertAdjacentHTML('beforeend',
  '<h2 id="reg-h">New student? Register</h2>' +
  '<form id="reg-form"><label for="reg-email">College email (ends with @stu.pes.edu)</label><input id="reg-email" type="email" required>' +
  '<label for="reg-pass">Password (6 or more characters)</label><input id="reg-pass" type="password" minlength="6" required>' +
  '<button type="submit">Send OTP</button></form>' +
  '<form id="otp-form" hidden><label for="reg-otp">OTP (look in the server window)</label><input id="reg-otp" inputmode="numeric" required>' +
  '<button type="submit">Verify and finish</button></form>');
$('reg-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('POST', '/auth/register', { email: $('reg-email').value.trim(), password: $('reg-pass').value });
    say('OTP sent. The code is printed in the server window.', 'ok');
    $('otp-form').hidden = false;
    $('reg-otp').focus();
  } catch (err) { say(err.message, 'err'); }
});
$('otp-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const r = await api('POST', '/auth/verify-otp', { email: $('reg-email').value.trim(), otp: $('reg-otp').value.trim() });
    say('Registered. Student ID ' + r.studentId + '. You can sign in now.', 'ok');
    $('otp-form').hidden = true;
    $('email').value = $('reg-email').value.trim();
    $('password').focus();
  } catch (err) { say(err.message, 'err'); }
});

// ---- Student screens ----
sec('student', 'resume', 'My resume (PDF, up to 5 MB)',
  '<label for="resume-file">Choose a PDF</label><input id="resume-file" type="file" accept="application/pdf">' +
  '<button type="button" id="resume-up">Upload</button> <button type="button" id="resume-down" class="secondary">Download my resume</button>');
onClick('resume-up', async () => {
  const f = $('resume-file').files[0];
  if (!f) throw new Error('Choose a PDF first.');
  const fd = new FormData();
  fd.append('resume', f);
  const res = await authFetch('/resume', { method: 'PUT', body: fd });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.message || 'Upload failed');
  say('Resume uploaded: ' + d.fileName, 'ok');
});
onClick('resume-down', async () => {
  const res = await authFetch('/resume');
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message || 'No resume uploaded yet'); }
  download(await res.blob(), 'my-resume.pdf');
  say('Resume downloaded.', 'ok');
});

sec('student', 'notif', 'Notifications',
  '<button type="button" id="notif-load" class="secondary">Refresh notifications</button><ul id="notif-list"></ul>');
onClick('notif-load', async () => {
  const list = await api('GET', '/notifications');
  fill($('notif-list'), list.map((n) => new Date(n.createdAt).toLocaleString() + ' - ' + n.message + (n.read ? '' : ' (new)')), 'No notifications yet.');
  say('Notifications refreshed.', 'ok');
});

sec('student', 'iq', 'Interview question bank',
  '<label for="iq-company">Company (leave empty for all)</label><input id="iq-company" type="text">' +
  '<button type="button" id="iq-go">Search</button><ul id="iq-list"></ul>');
onClick('iq-go', async () => {
  const qs = await api('GET', '/interview-questions?company=' + encodeURIComponent($('iq-company').value.trim()));
  fill($('iq-list'), qs.map((q) => q.company + ' [' + q.topic + '] ' + q.question), 'No questions for that company.');
  say(qs.length + ' question(s) found.', 'ok');
});

// ---- TPO screens ----
sec('tpo', 'stats', 'Placement statistics',
  '<button type="button" id="stats-load" class="secondary">Load statistics</button><pre id="stats-out"></pre>');
onClick('stats-load', async () => {
  const s = await api('GET', '/reports/stats');
  const b = s.applicationsByStatus;
  $('stats-out').textContent =
    'Total drives: ' + s.totalDrives + '\nTotal applications: ' + s.totalApplications +
    '\nApplied: ' + b.applied + '   Shortlisted: ' + b.shortlisted + '   Rejected: ' + b.rejected + '   Selected: ' + b.selected +
    '\nPackage range (LPA): ' + (s.packageRange ? s.packageRange.min + ' to ' + s.packageRange.max : 'no selections yet') +
    '\n\nPer drive:\n' + s.perDrive.map((d) => '  #' + d.driveId + ' ' + d.company + ': ' + d.applications + ' applications, ' + d.selected + ' selected').join('\n');
  say('Statistics loaded.', 'ok');
});

sec('tpo', 'appl', 'Applicants and status',
  '<label for="ap-drive">Drive ID (see the table above)</label><input id="ap-drive" type="number" min="1">' +
  '<button type="button" id="ap-load" class="secondary">Show applicants</button> <button type="button" id="ap-dl" class="secondary">Download CSV</button>' +
  '<pre id="ap-out"></pre>' +
  '<label for="ap-id">Application ID (first column above)</label><input id="ap-id" type="number" min="1">' +
  '<label for="ap-status">New status</label><select id="ap-status"><option>applied</option><option>shortlisted</option><option>rejected</option><option>selected</option></select>' +
  '<button type="button" id="ap-set">Update status</button>');
async function csv() {
  const res = await authFetch('/drives/' + $('ap-drive').value + '/applicants/export');
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message || 'Export failed'); }
  return res.text();
}
onClick('ap-load', async () => {
  $('ap-out').textContent = (await csv()).replace(/^\uFEFF/, '');
  say('Applicants loaded.', 'ok');
});
onClick('ap-dl', async () => {
  download(new Blob([await csv()], { type: 'text/csv' }), 'applicants-drive-' + $('ap-drive').value + '.csv');
  say('CSV downloaded.', 'ok');
});
onClick('ap-set', async () => {
  await api('PATCH', '/applications/' + $('ap-id').value + '/status', { status: $('ap-status').value });
  say('Status updated. The student now has a notification.', 'ok');
});
