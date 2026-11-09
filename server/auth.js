import { createRemoteJWKSet, jwtVerify } from 'jose';

function getAuthOrigin(authUrl) {
  if (!authUrl) return null;

  const parsedUrl = new URL(authUrl);
  if (parsedUrl.protocol !== 'https:' && parsedUrl.hostname !== 'localhost') {
    throw new Error('NEON_AUTH_URL must use HTTPS outside localhost.');
  }

  return parsedUrl.origin;
}

export function createAuthentication({
  authUrl = process.env.NEON_AUTH_URL,
  verifyToken,
} = {}) {
  const issuer = getAuthOrigin(authUrl);
  const jwks = issuer
    ? createRemoteJWKSet(new URL(`${authUrl.replace(/\/+$/, '')}/.well-known/jwks.json`))
    : null;

  return async function authenticate(request, response, next) {
    if (!issuer || !jwks && !verifyToken) {
      response.status(503).json({ error: 'Authentication is not configured on the server.' });
      return;
    }

    const authorization = request.get('Authorization');
    const match = typeof authorization === 'string'
      ? /^Bearer ([^\s]+)$/i.exec(authorization)
      : null;
    if (!match) {
      response.status(401).json({ error: 'Sign in is required.' });
      return;
    }

    try {
      const payload = verifyToken
        ? await verifyToken(match[1])
        : (await jwtVerify(match[1], jwks, { issuer, audience: issuer })).payload;
      if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
        response.status(401).json({ error: 'The sign-in token is invalid.' });
        return;
      }

      request.auth = { userId: payload.sub };
      next();
    } catch {
      response.status(401).json({ error: 'The sign-in token is invalid or expired.' });
    }
  };
}

export function createCuratorAuthorization(isCurator) {
  return async function requireCurator(request, response, next) {
    if (!request.auth?.userId) {
      response.status(401).json({ error: 'Sign in is required.' });
      return;
    }

    try {
      if (!(await isCurator(request.auth.userId))) {
        response.status(403).json({ error: 'Curator access is required.' });
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
