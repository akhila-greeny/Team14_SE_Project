// Dev tool: node make-token.js <id> <role>   e.g. node make-token.js 1 student
const jwt = require('jsonwebtoken');
const id = Number(process.argv[2] || 1);
const role = process.argv[3] || 'student';
console.log(jwt.sign({ id, role }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '1h' }));
