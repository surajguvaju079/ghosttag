import { validateEnvironment } from './environment';

export default () => {
  const { port, environment, databaseUrl } = validateEnvironment(process.env);
  return {
    app: { port, environment },
    database: { url: databaseUrl },
  };
};
