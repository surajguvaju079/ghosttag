import { validateEnvironment } from './environment';

describe('Environment validation', () => {
  it('preserves local defaults and permits private database networks', () => {
    expect(validateEnvironment({})).toEqual({
      port: 3000,
      environment: 'development',
      databaseUrl: undefined,
    });
    expect(
      validateEnvironment({
        NODE_ENV: 'production',
        PORT: '8080',
        DATABASE_URL: 'postgresql://service:fixture@db.internal/ghosttag',
      }).port,
    ).toBe(8080);
  });
  it.each(['0', '65536', '8080oops', '3.5', '-1', ''])(
    'rejects invalid port %s',
    (PORT) => {
      expect(() => validateEnvironment({ PORT })).toThrow('PORT');
    },
  );
  it('rejects invalid environments and missing production database config', () => {
    expect(() => validateEnvironment({ NODE_ENV: 'prod' })).toThrow('NODE_ENV');
    expect(() => validateEnvironment({ NODE_ENV: 'production' })).toThrow(
      'DATABASE_URL',
    );
  });
  it.each([
    'not-a-url',
    'https://db.internal/ghosttag',
    'postgresql://db.internal/',
  ])(
    'rejects invalid database URLs without including their value in errors',
    (DATABASE_URL) => {
      expect(() => validateEnvironment({ DATABASE_URL })).toThrow(
        /^DATABASE_URL/,
      );
    },
  );
  it('rejects the known Compose password in production without exposing it', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://ghosttag:ghosttag_dev@db.internal/ghosttag',
      }),
    ).toThrow(
      'Production cannot use the Compose development database password',
    );
  });
});
