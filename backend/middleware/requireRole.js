
const jwt = require('jsonwebtoken');

// Allows the request only if the logged-in user has the given role.
function requireRole(role) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.replace('Bearer ', '');

    if (!token) {
      return res
        .status(401)
        .json({ error_code: 'UNAUTHORIZED', message: 'Token missing' });
    }

    try {
      const secret = process.env.JWT_SECRET || 'dev-secret';
      const user = jwt.verify(token, secret);

      if (user.role !== role) {
        return res
          .status(403)
          .json({ error_code: 'FORBIDDEN', message: 'Access denied' });
      }

      req.user = user;
      next();
    } catch (err) {
      return res
        .status(401)
        .json({ error_code: 'UNAUTHORIZED', message: 'Invalid token' });
    }
  };
}

module.exports = requireRole;
