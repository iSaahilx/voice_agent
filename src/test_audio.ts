import { createClient } from '@deepgram/sdk';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;

if (!DEEPGRAM_API_KEY) {
  console.error('Please set your DEEPGRAM_API_KEY in the .env file');
  process.exit(1);
}

async function main() {
  try {
    const deepgram = createClient(DEEPGRAM_API_KEY);

    const text = "Hello, I'm Saahil! How are you?";

    console.log('Requesting test TTS audio from Deepgram...');

    const response = await deepgram.speak.request(
      {
        text
      },
      {
        model: 'aura-2-thalia-en',
        encoding: 'linear16',
        sample_rate: 16000,
        container: 'wav'
      }
    );

    const stream = await response.getStream();
    if (!stream) {
      throw new Error('No audio stream returned from Deepgram');
    }
    const chunks: Buffer[] = [];
    for await (const chunk of stream as any) {
      chunks.push(Buffer.from(chunk));
    }
    const audioBuffer = Buffer.concat(chunks);

    const outDir = path.join(__dirname, '../memory');
    await fs.promises.mkdir(outDir, { recursive: true });
    const outPath = path.join(outDir, 'test-audio.wav');

    await fs.promises.writeFile(outPath, audioBuffer);

    console.log('Test audio written to:', outPath);
    console.log('Play this file locally (e.g., with VLC, QuickTime, or any media player).');
    console.log('If this sounds clean, the lag is likely in the browser/WebSocket pipeline, not the TTS engine.');
  } catch (err) {
    console.error('Error generating test audio:', err);
    process.exit(1);
  }
}

void main();


