import { serve } from './gui95-serve.mjs';
await serve({ root: process.cwd(), port: Number(process.env.PORT || 4905) });
