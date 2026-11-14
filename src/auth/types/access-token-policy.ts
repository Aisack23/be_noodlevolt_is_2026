export const ACCESS_TOKEN_POLICY = {
  algorithms: ['HS256'] as ['HS256'],
  issuer: 'noodlevolt-api',
  audience: 'noodlevolt-client',
  clockTolerance: 0,
};

export const ACCESS_TOKEN_MAX_SECONDS = 900;
