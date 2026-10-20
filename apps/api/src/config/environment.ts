export function validateEnvironment(env: NodeJS.ProcessEnv): {
  port: number;
  environment: string;
  databaseUrl: string | undefined;
} {
  const environment = env.NODE_ENV ?? 'development';
  if (!['development', 'test', 'production'].includes(environment))
    throw new Error('NODE_ENV must be development, test, or production');
  const rawPort = env.PORT ?? '3000';
  const port = Number(rawPort);
  if (
    !/^\d+$/.test(rawPort) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  )
    throw new Error('PORT must be an integer between 1 and 65535');
  const databaseUrl = env.DATABASE_URL;
  if (environment === 'production' && !databaseUrl)
    throw new Error('Production requires DATABASE_URL');
  if (databaseUrl) {
    let url: URL;
    try {
      url = new URL(databaseUrl);
    } catch {
      throw new Error('DATABASE_URL must be a PostgreSQL connection URL');
    }
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !url.hostname ||
      url.pathname === '/' ||
      !url.pathname
    )
      throw new Error(
        'DATABASE_URL must identify a PostgreSQL host and database',
      );
    if (
      environment === 'production' &&
      decodeURIComponent(url.password) === 'ghosttag_dev'
    )
      throw new Error(
        'Production cannot use the Compose development database password',
      );
  }
  return { port, environment, databaseUrl };
}
