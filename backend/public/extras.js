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

// ---- Mock Tests: topic selection, timer, submission and results ----
sec('student', 'mock-tests', 'Mock Tests',
  '<label for="mt-topic">Choose a topic</label>' +
  '<select id="mt-topic"><option value="">All topics</option><option value="aptitude">Aptitude</option><option value="technical">Technical</option></select>' +
  '<button type="button" id="mt-load">Load mock tests</button>' +
  '<ul id="mt-test-list"></ul>' +
  '<div id="mt-active" hidden><h3 id="mt-title"></h3><p>Time remaining: <strong id="mt-timer">--:--</strong></p>' +
  '<div id="mt-questions"></div><button type="button" id="mt-submit">Submit test</button></div>' +
  '<div id="mt-result"></div>');

let mtCurrentAttempt = null;
let mtCurrentAnswers = {};
let mtTimerInterval = null;
let mtEndTime = null;

function mtShowResults(attempt) {
  clearInterval(mtTimerInterval);
  mtCurrentAttempt = null;
  $('mt-active').hidden = true;

  const results = attempt.results || [];
  let html = '<h3>Test Result</h3>' +
    '<p>Score: <strong>' + attempt.score + ' / ' + attempt.total + '</strong></p>' +
    '<p>Percentage: <strong>' + attempt.percentage + '%</strong></p>' +
    '<p>Submission: ' + (attempt.autoSubmitted ? 'Automatic' : 'Manual') + '</p>';

  results.forEach((r, i) => {
    html += '<p>Question ' + (i + 1) + ': ' +
      (r.correct ? 'Correct' : 'Incorrect') +
      ' | Your answer: ' + (r.yourAnswer === null ? 'Not answered' : r.yourAnswer + 1) +
      ' | Correct answer: ' + (r.correctAnswer + 1) + '</p>';
  });

  $('mt-result').innerHTML = html;
  say('Mock test completed. Your score is ' + attempt.score + '/' + attempt.total, 'ok');
}

function mtUpdateTimer() {
  if (!mtCurrentAttempt) return;
  const seconds = Math.max(0, Math.ceil((mtEndTime - Date.now()) / 1000));
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  $('mt-timer').textContent = mins + ':' + String(secs).padStart(2, '0');

  if (seconds <= 0) mtSubmitTest(true);
}

async function mtSubmitTest(auto) {
  if (!mtCurrentAttempt) return;
  const id = mtCurrentAttempt.id;
  $('mt-submit').disabled = true;

  try {
    const result = await api('POST', '/mock-tests/attempts/' + id + '/submit',
      { answers: mtCurrentAnswers });
    mtShowResults(result.attempt);
  } catch (err) {
    if (err.status === 409) {
      const current = await api('GET', '/mock-tests/attempts/' + id);
      if (current.attempt.status === 'submitted') {
        mtShowResults(current.attempt);
        return;
      }
    }
    say(err.message, 'err');
  } finally {
    $('mt-submit').disabled = false;
  }
}

async function mtStartTest(id) {
  const data = await api('POST', '/mock-tests/' + id + '/start', {});
  mtCurrentAttempt = data.attempt;
  mtCurrentAnswers = {};
  mtEndTime = Date.now() + data.attempt.secondsLeft * 1000;

  $('mt-result').textContent = '';
  $('mt-active').hidden = false;
  $('mt-title').textContent = data.test.topic;
  $('mt-questions').textContent = '';

  data.test.questions.forEach((q, index) => {
    const section = document.createElement('section');
    const heading = document.createElement('h4');
    heading.textContent = (index + 1) + '. ' + q.text;
    section.appendChild(heading);

    q.options.forEach((option, optionIndex) => {
      const label = document.createElement('label');
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'mt-q-' + q.id;
      radio.value = optionIndex;

      radio.addEventListener('change', async () => {
        mtCurrentAnswers[q.id] = optionIndex;
        try {
          await api('PATCH', '/mock-tests/attempts/' + mtCurrentAttempt.id + '/answers',
            { answers: mtCurrentAnswers });
        } catch (err) {
          say(err.message, 'err');
        }
      });

      label.appendChild(radio);
      label.appendChild(document.createTextNode(' ' + option));
      section.appendChild(label);
      section.appendChild(document.createElement('br'));
    });

    $('mt-questions').appendChild(section);
  });

  $('mt-submit').disabled = false;
  clearInterval(mtTimerInterval);
  mtUpdateTimer();
  mtTimerInterval = setInterval(mtUpdateTimer, 1000);
  say('Mock test started. Good luck!', 'ok');
}

onClick('mt-load', async () => {
  const topic = $('mt-topic').value;
  const tests = await api('GET', '/mock-tests' + (topic ? '?topic=' + encodeURIComponent(topic) : ''));
  const list = $('mt-test-list');
  list.textContent = '';

  tests.forEach((test) => {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Start ' + test.topic + ' (' + test.questionCount + ' questions)';
    button.addEventListener('click', async () => {
      try { await mtStartTest(test.id); }
      catch (err) { say(err.message, 'err'); }
    });
    li.appendChild(button);
    list.appendChild(li);
  });

  if (!tests.length) list.textContent = 'No tests available.';
  say(tests.length + ' mock test(s) found.', 'ok');
});

onClick('mt-submit', async () => {
  await mtSubmitTest(false);
});


// ---- Mock Test Attempt History ----
sec('student', 'mock-history', 'Mock Test Attempt History',
  '<button type="button" id="mh-load">View my attempt history</button>' +
  '<ul id="mh-list"></ul>'
);

onClick('mh-load', async () => {
  const list = $('mh-list');
  list.innerHTML = '<li>Loading history...</li>';

  const data = await api('GET', '/mock-tests/history');
  const attempts = data.attempts || [];

  list.innerHTML = '';

  if (attempts.length === 0) {
    list.innerHTML = '<li>No mock test attempts yet.</li>';
    return;
  }

  attempts.forEach((attempt) => {
    const item = document.createElement('li');

    const date = attempt.submittedAt || attempt.startedAt;
    const formattedDate = date ? new Date(date).toLocaleString() : 'Date unavailable';

    item.textContent =
      (attempt.topic || 'Mock Test') +
      ' | Score: ' + attempt.score + '/' + attempt.total +
      ' | Percentage: ' + attempt.percentage + '%' +
      ' | ' + (attempt.autoSubmitted ? 'Auto-submitted' : 'Manually submitted') +
      ' | ' + formattedDate;

    list.appendChild(item);
  });
});


// ---- Mock Interview Slot Booking ----
sec('student', 'mock-interviews', 'Mock Interview Slot Booking',
  '<button type="button" id="mi-load">View available interview slots</button>' +
  '<ul id="mi-slots"></ul>' +
  '<h3>My Interview Schedule</h3>' +
  '<button type="button" id="mi-schedule-load">View my schedule</button>' +
  '<ul id="mi-schedule"></ul>'
);

onClick('mi-load', async () => {
  const list = $('mi-slots');
  list.innerHTML = '<li>Loading available slots...</li>';

  const slots = await api('GET', '/mock-interviews/slots');
  list.innerHTML = '';

  if (!slots.length) {
    list.innerHTML = '<li>No available interview slots currently.</li>';
    return;
  }

  slots.forEach((slot) => {
    const item = document.createElement('li');
    const date = new Date(slot.startsAt).toLocaleString();

    const details = document.createElement('span');
    details.textContent =
      'Reviewer: ' + (slot.reviewerName || 'Not specified') +
      ' | Date: ' + date +
      ' | Duration: ' + slot.durationMinutes + ' minutes ';

    const bookButton = document.createElement('button');
    bookButton.type = 'button';
    bookButton.textContent = 'Book Slot';

    bookButton.addEventListener('click', async () => {
      bookButton.disabled = true;
      try {
        await api('POST', '/mock-interviews/slots/' + encodeURIComponent(slot.id) + '/book');
        say('Interview slot booked successfully!', 'success');
        item.remove();
      } catch (err) {
        say(err.message, 'err');
        bookButton.disabled = false;
      }
    });

    item.appendChild(details);
    item.appendChild(bookButton);
    list.appendChild(item);
  });
});

onClick('mi-schedule-load', async () => {
  const list = $('mi-schedule');
  list.innerHTML = '<li>Loading your schedule...</li>';

  const sessions = await api('GET', '/mock-interviews/schedule');
  list.innerHTML = '';

  if (!sessions.length) {
    list.innerHTML = '<li>You have no booked interviews yet.</li>';
    return;
  }

  sessions.forEach((session) => {
    const item = document.createElement('li');
    item.textContent =
      'Date: ' + new Date(session.startsAt).toLocaleString() +
      ' | Duration: ' + session.durationMinutes + ' minutes' +
      ' | Your role: ' + session.myRole +
      ' | Status: ' + session.status;

    list.appendChild(item);
  });
});


// ---- Mock Interview Feedback ----
sec('student', 'mock-feedback', 'Mock Interview Feedback',
  '<button type="button" id="mf-load">Load my interview sessions</button>' +
  '<ul id="mf-sessions"></ul>'
);

async function mfLoadSessions() {
  const list = $('mf-sessions');
  list.innerHTML = '<li>Loading sessions...</li>';

  const sessions = await api('GET', '/mock-interviews/schedule');
  list.innerHTML = '';

  if (!sessions.length) {
    list.innerHTML = '<li>No interview sessions found.</li>';
    return;
  }

  sessions.forEach((session) => {
    const item = document.createElement('li');

    const details = document.createElement('p');
    details.textContent =
      new Date(session.startsAt).toLocaleString() +
      ' | Role: ' + session.myRole +
      ' | Status: ' + session.status;

    item.appendChild(details);

    if (session.myRole === 'reviewer' && session.status === 'booked') {
      const completeButton = document.createElement('button');
      completeButton.type = 'button';
      completeButton.textContent = 'Mark Interview Completed';

      completeButton.addEventListener('click', async () => {
        completeButton.disabled = true;
        try {
          await api(
            'POST',
            '/mock-interviews/sessions/' + encodeURIComponent(session.id) + '/complete'
          );
          say('Interview marked as completed.', 'success');
          await mfLoadSessions();
        } catch (err) {
          say(err.message, 'err');
          completeButton.disabled = false;
        }
      });

      item.appendChild(completeButton);
    }

    if (session.myRole === 'reviewer' && session.status === 'completed') {
      const feedbackInput = document.createElement('textarea');
      feedbackInput.placeholder = 'Enter interview feedback (maximum 2000 characters)';
      feedbackInput.maxLength = 2000;
      feedbackInput.rows = 3;

      const submitButton = document.createElement('button');
      submitButton.type = 'button';
      submitButton.textContent = 'Submit Feedback';

      submitButton.addEventListener('click', async () => {
        const feedbackText = feedbackInput.value.trim();

        if (!feedbackText) {
          say('Please enter feedback first.', 'err');
          return;
        }

        submitButton.disabled = true;
        try {
          await api(
            'POST',
            '/mock-interviews/sessions/' + encodeURIComponent(session.id) + '/feedback',
            { text: feedbackText }
          );
          say('Interview feedback submitted successfully!', 'success');
          await mfLoadSessions();
        } catch (err) {
          say(err.message, 'err');
          submitButton.disabled = false;
        }
      });

      item.appendChild(feedbackInput);
      item.appendChild(submitButton);
    }

    if (session.myRole === 'student') {
      const viewButton = document.createElement('button');
      viewButton.type = 'button';
      viewButton.textContent = 'View Interview Feedback';

      viewButton.addEventListener('click', async () => {
        try {
          const details = await api(
            'GET',
            '/mock-interviews/sessions/' + encodeURIComponent(session.id)
          );

          const feedbackDisplay = document.createElement('p');

          feedbackDisplay.textContent = details.feedback
            ? 'Reviewer Feedback: ' + details.feedback.text
            : 'Feedback has not been submitted yet.';

          item.appendChild(feedbackDisplay);
          viewButton.disabled = true;
        } catch (err) {
          say(err.message, 'err');
        }
      });

      item.appendChild(viewButton);
    }

    list.appendChild(item);
  });
}

onClick('mf-load', mfLoadSessions);

