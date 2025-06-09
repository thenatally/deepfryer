import express from 'express';
import { handler } from './build/handler.js';
import { env } from 'process';
import dotenv from 'dotenv';
import cors from 'cors';
// dotenv.config();
console.log(env.BODY_SIZE_LIMIT)
const app = express();

// app.use(express.raw({ type: '*/*', limit: '40mb' }));
app.use(cors());
app.use(handler);
app.listen(3000, () => {
  console.log('Server listening on port 3000');
});
