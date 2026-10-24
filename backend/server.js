
const express = require('express');
const drivesRouter = require('./routes/drives');

const app = express();
app.use(express.json());

app.use('/api/drives', drivesRouter);

app.use('/api/profile', require('./routes/profile'));
app.use('/api/drives', require('./routes/eligibleDrives'));
app.listen(3000, () => console.log('Server running on port 3000'));


