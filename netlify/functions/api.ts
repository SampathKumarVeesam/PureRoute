import serverless from 'serverless-http';
import { createApp, ensureDbReady } from '../../server/createApp.ts';

const app = createApp();
const serverlessHandler = serverless(app);

export const handler = async (event: any, context: any) => {
  // Prevent serverless function from hanging on open database pools
  context.callbackWaitsForEmptyEventLoop = false;

  try {
    await ensureDbReady();
  } catch (err: any) {
    console.warn('Database initialization note in Netlify Function:', err.message);
  }

  // Normalize path in case of Netlify internal function rewrites
  if (event.path && event.path.startsWith('/.netlify/functions/api')) {
    event.path = event.path.replace('/.netlify/functions/api', '/api');
  } else if (event.path && !event.path.startsWith('/api')) {
    event.path = `/api${event.path}`;
  }

  return await serverlessHandler(event, context);
};
