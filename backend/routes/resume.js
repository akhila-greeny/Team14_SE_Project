const express = require('express');
const multer = require('multer');
const requireRole = require('../middleware/requireRole');
const { STUDENT } = require('../utils/roles');
const { saveResume, getResume } = require('../data/resumesStore');

const router = express.Router();
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_SIZE } }).single('resume');

// OIPP-F-005: upload a PDF resume (max 5 MB)
router.put('/', requireRole(STUDENT), (req, res) => {
  upload(req, res, (err) => {
    if (err) {
      const tooBig = err.code === 'LIMIT_FILE_SIZE';
      return res.status(400).json({
        error_code: tooBig ? 'FILE_TOO_LARGE' : 'UPLOAD_ERROR',
        message: tooBig ? 'Resume must be 5 MB or smaller' : err.message,
      });
    }
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error_code: 'NO_FILE', message: 'Attach a PDF in the "resume" field' });
    }
    const isPdf = file.mimetype === 'application/pdf' && file.buffer.slice(0, 5).toString() === '%PDF-';
    if (!isPdf) {
      return res.status(400).json({ error_code: 'INVALID_FILE_TYPE', message: 'Only PDF files are allowed' });
    }
    const saved = saveResume(req.user.id, { originalName: file.originalname, buffer: file.buffer });
    res.status(201).json({ message: 'Resume uploaded', fileName: saved.originalName, size: saved.size });
  });
});

// OIPP-F-005: download it back at any time
router.get('/', requireRole(STUDENT), (req, res) => {
  const resume = getResume(req.user.id);
  if (!resume) {
    return res.status(404).json({ error_code: 'RESUME_NOT_FOUND', message: 'No resume uploaded yet' });
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="' + resume.originalName + '"');
  res.send(resume.buffer);
});

module.exports = router;
