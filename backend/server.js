
const express = require('express');
const requireRole = require('./middleware/requireRole');

const app = express();
app.use(express.json());

// Only a TPO can post a drive (demo route)
app.post('/api/drives', requireRole('TPO'), (req, res) => {
  res.status(201).json({ message: 'Drive posted (demo)' });
});

app.listen(3000, () => console.log('Server running on port 3000'));
