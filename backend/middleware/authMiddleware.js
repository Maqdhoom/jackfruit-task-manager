const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
  const authorization = req.get('authorization');
  const bearerToken = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : null;
  const token = req.cookies?.token || bearerToken;

  if (!token) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  const { JWT_SECRET } = process.env;

  if (!JWT_SECRET) {
    return next(new Error('JWT_SECRET is not configured'));
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);

    if (
      typeof payload === 'string' ||
      typeof payload.sub !== 'string' ||
      !/^[a-f\d]{24}$/i.test(payload.sub)
    ) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    req.userId = payload.sub;
    return next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    return next(error);
  }
}

module.exports = authMiddleware;
