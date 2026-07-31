import { deriveCodeChallenge, generateCodeVerifier, generateState } from './pkce';

describe('generateCodeVerifier', () => {
  it('defaults to 64 chars and honours a custom length', () => {
    expect(generateCodeVerifier()).toHaveLength(64);
    expect(generateCodeVerifier(43)).toHaveLength(43);
    expect(generateCodeVerifier(128)).toHaveLength(128);
  });

  it('stays within the RFC 7636 unreserved charset', () => {
    // Sample a few times to exercise different random bytes.
    for (let i = 0; i < 20; i++) {
      expect(generateCodeVerifier()).toMatch(/^[A-Za-z0-9\-._~]+$/);
    }
  });

  it('produces distinct verifiers across calls', () => {
    expect(generateCodeVerifier()).not.toBe(generateCodeVerifier());
  });
});

describe('deriveCodeChallenge', () => {
  // The canonical worked example from RFC 7636 Appendix B. If base64url
  // encoding or the SHA-256 digest regresses, this vector breaks.
  it('matches the RFC 7636 test vector', async () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    await expect(deriveCodeChallenge(verifier)).resolves.toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('emits url-safe base64 with no +, / or = padding', async () => {
    const challenge = await deriveCodeChallenge(generateCodeVerifier());
    expect(challenge).not.toMatch(/[+/=]/);
  });
});

describe('generateState', () => {
  it('returns a non-empty url-safe token', () => {
    const state = generateState();
    expect(state.length).toBeGreaterThan(0);
    expect(state).not.toMatch(/[+/=]/);
  });

  it('is unique per call', () => {
    expect(generateState()).not.toBe(generateState());
  });
});
