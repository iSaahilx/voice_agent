import { createClient, AgentEvents } from '@deepgram/sdk';
import { WebSocket } from 'ws';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

type TranscriptEntry = {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
};

type UserMemory = {
  user_id: string;
  profile: {
    name?: string;
  };
  preferences: {
    response_style?: string;
    latency_sensitive?: boolean;
  };
  facts: string[];
  conversation_summary: string;
  updated_at: string;
};

const MEMORY_DIR = path.join(__dirname, '../memory');
const TRANSCRIPTS_DIR = path.join(MEMORY_DIR, 'transcripts');
// For now we assume a single user; this can be wired to auth / query params later.
const DEFAULT_USER_ID = 'saahil';

async function ensureMemoryDirs(): Promise<void> {
  await fs.promises.mkdir(MEMORY_DIR, { recursive: true });
  await fs.promises.mkdir(TRANSCRIPTS_DIR, { recursive: true });
}

async function loadUserMemory(userId: string): Promise<UserMemory | null> {
  const filePath = path.join(MEMORY_DIR, `${userId}.json`);
  try {
    const data = await fs.promises.readFile(filePath, 'utf8');
    return JSON.parse(data) as UserMemory;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    console.error('Error loading user memory:', err);
    return null;
  }
}

async function saveUserMemory(memory: UserMemory): Promise<void> {
  const filePath = path.join(MEMORY_DIR, `${memory.user_id}.json`);
  await fs.promises.writeFile(filePath, JSON.stringify(memory, null, 2), 'utf8');
}

async function saveTranscript(
  userId: string,
  transcript: TranscriptEntry[]
): Promise<void> {
  if (!transcript.length) return;
  const fileName = `${userId}-${Date.now()}.json`;
  const filePath = path.join(TRANSCRIPTS_DIR, fileName);
  await fs.promises.writeFile(JSON.stringify(transcript, null, 2), 'utf8').catch(
    (err) => {
      console.error('Error saving transcript:', err);
    }
  );
}

function buildMemoryPrompt(memory: UserMemory | null): string {
  if (!memory) {
    return '';
  }

  const lines: string[] = [];
  lines.push('Known user memory:');

  if (memory.profile.name) {
    lines.push(`- User name: ${memory.profile.name}`);
  }

  if (memory.preferences.response_style || memory.preferences.latency_sensitive) {
    const prefs: string[] = [];
    if (memory.preferences.response_style) {
      prefs.push(`prefers ${memory.preferences.response_style} explanations`);
    }
    if (memory.preferences.latency_sensitive) {
      prefs.push('is sensitive to latency');
    }
    lines.push(`- Preferences: ${prefs.join(', ')}`);
  }

  if (memory.facts.length) {
    lines.push('- Facts:');
    for (const fact of memory.facts.slice(0, 10)) {
      lines.push(`  • ${fact}`);
    }
  }

  if (memory.conversation_summary) {
    lines.push(`- Last conversation summary: ${memory.conversation_summary}`);
  }

  return lines.join('\n');
}

function createUpdatedMemory(
  userId: string,
  existing: UserMemory | null,
  transcript: TranscriptEntry[],
  candidateFacts: string[]
): UserMemory {
  const now = new Date().toISOString();
  const base: UserMemory =
    existing ??
    ({
      user_id: userId,
      profile: {},
      preferences: {},
      facts: [],
      conversation_summary: '',
      updated_at: now
    } as UserMemory);

  // Very lightweight, deterministic "summarization" to stay out of live loop.
  const userUtterances = transcript
    .filter((t) => t.role === 'user')
    .map((t) => t.content);
  const assistantUtterances = transcript
    .filter((t) => t.role === 'assistant')
    .map((t) => t.content);

  const summaryParts: string[] = [];
  if (userUtterances.length) {
    summaryParts.push(
      `User said things like: "${userUtterances[0].slice(0, 120)}"${
        userUtterances.length > 1 ? ' ...' : ''
      }`
    );
  }
  if (assistantUtterances.length) {
    summaryParts.push(
      `Assistant responded in a concise, latency-focused style (last reply: "${assistantUtterances[
        assistantUtterances.length - 1
      ].slice(0, 120)}")`
    );
  }

  const newFacts = new Set<string>(base.facts);
  for (const fact of candidateFacts) {
    const trimmed = fact.trim();
    if (trimmed) newFacts.add(trimmed);
  }

  return {
    ...base,
    facts: Array.from(newFacts).slice(0, 50),
    conversation_summary: summaryParts.join(' '),
    updated_at: now
  };
}

async function persistSessionMemory(
  userId: string,
  transcript: TranscriptEntry[],
  candidateFacts: string[]
): Promise<void> {
  try {
    if (!transcript.length && !candidateFacts.length) return;
    await ensureMemoryDirs();
    const existing = await loadUserMemory(userId);
    const updated = createUpdatedMemory(userId, existing, transcript, candidateFacts);
    await Promise.all([saveUserMemory(updated), saveTranscript(userId, transcript)]);
  } catch (err) {
    console.error('Error persisting session memory:', err);
  }
}

// Load environment variables
dotenv.config();

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;

if (!DEEPGRAM_API_KEY) {
  console.error('Please set your DEEPGRAM_API_KEY in the .env file');
  process.exit(1);
}

// Initialize Deepgram
const deepgram = createClient(DEEPGRAM_API_KEY);

// Create HTTP server to serve the static HTML file
const server = http.createServer((req, res) => {
  if (req.url === '/') {
    fs.readFile(path.join(__dirname, '../static/index.html'), (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end('Error loading index.html');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    });
  }
});

// Function to connect to Deepgram Voice Agent
async function connectToAgent(userId: string) {
  try {
    // Create an agent connection
    const agent = deepgram.agent();
    const transcript: TranscriptEntry[] = [];
    const candidateFacts: string[] = [];

    // Set up event handlers
    agent.on(AgentEvents.Open, () => {
      console.log('Agent connection established');
    });

    agent.on('Welcome', (data) => {
      // Configure agent for lowest latency and inject long-term memory once per session
      // Using 16kHz for lower latency (smaller audio chunks = faster processing)
      (async () => {
        await ensureMemoryDirs();
        const memory = await loadUserMemory(userId);
        const memoryPrompt = buildMemoryPrompt(memory);

        const basePrompt = `You are Saahil.
You give concise answers. You like philosophy, learning and writing. You like travelling, capturing moments, and observing the world. You are an ambitious and passionate AI engineer who likes creating solutions and building cool things. You are determined and hardworking. You think big, move fast, and communicate with clarity and empathy. You are always learning about new things and experimenting. One of the recent solutions you created was an itinerary planner agent for a trip down to exact expenses.
Answer as if you are Saahil, not as if you're describing him. Quote famous philosophies sometimes.
Keep responses brief (1-2 sentences, under 50 words). Be natural and conversational.

IMPORTANT: Speak naturally like a human. Occasionally use filler words like "umm", "uhh", "like", "you know", "well", or brief pauses when thinking. Don't overuse them, but sprinkle them in naturally to make speech feel more human and less robotic.`;

        const combinedPrompt =
          (memoryPrompt ? `${memoryPrompt}\n\n` : '') + basePrompt;

      agent.configure({
        audio: {
          input: {
            encoding: 'linear16',
              sample_rate: 16000 // Lower sample rate = smaller chunks = lower latency
          },
          output: {
            encoding: 'linear16',
              sample_rate: 16000,
              container: 'none' // No container overhead
          }
        },
        agent: {
          listen: {
            provider: {
              type: 'deepgram',
                model: 'nova-2' // nova-2 is optimized for low latency
            }
          },
          think: {
            provider: {
                type: 'open_ai',
                model: 'gpt-4o-mini'
            },
              // Minimal prompt for faster processing with one-time memory injection
              prompt: combinedPrompt
          },
          speak: {
            provider: {
              type: 'deepgram',
              model: 'aura-2-thalia-en' // Low-latency TTS model
            }
          },
            // Minimal greeting for faster start
            greeting: 'Hi!'
        }
        });
      })().catch((err) => {
        console.error('Error configuring agent with memory:', err);
      });
    });

    agent.on('SettingsApplied', (data) => {
      console.log('Server confirmed settings:', data);
    });

    agent.on(AgentEvents.AgentStartedSpeaking, (data: { total_latency?: number }) => {
      // Send latency info to frontend
      if (browserWs?.readyState === WebSocket.OPEN) {
        try {
          browserWs.send(JSON.stringify({
            type: 'agent_speaking',
            latency: data.total_latency,
            timestamp: Date.now()
          }));
        } catch (error) {
          console.error('Error sending agent speaking event:', error);
        }
      }
      // Log latency for monitoring
      if (data.total_latency) {
        console.log(`Agent started speaking - Latency: ${data.total_latency}ms`);
      }
    });

    agent.on(
      AgentEvents.ConversationText,
      (message: { role: string; content: string }) => {
        const role = message.role === 'assistant' ? 'assistant' : 'user';
        const entry: TranscriptEntry = {
          role,
          content: message.content,
          timestamp: Date.now()
        };
        transcript.push(entry);

        // Very lightweight candidate fact marking (post-session summarization will decide)
        if (
          role === 'user' &&
          (/\bremember (this|that)\b/i.test(message.content) ||
            /\bmy name is\b/i.test(message.content))
        ) {
          candidateFacts.push(message.content);
        }

        // Send transcriptions to frontend
        if (browserWs?.readyState === WebSocket.OPEN) {
          try {
            browserWs.send(
              JSON.stringify({
                type: 'transcription',
                role: message.role,
                content: message.content,
                timestamp: Date.now()
              })
            );
          } catch (error) {
            console.error('Error sending transcription:', error);
          }
        }
      // Minimal logging to reduce overhead
      if (message.role === 'user' || message.role === 'assistant') {
        console.log(`${message.role}: ${message.content}`);
        }
      }
    );

    // Send user speaking events to frontend
    agent.on(AgentEvents.UserStartedSpeaking, () => {
      if (browserWs?.readyState === WebSocket.OPEN) {
        try {
          browserWs.send(JSON.stringify({
            type: 'user_speaking',
            timestamp: Date.now()
          }));
        } catch (error) {
          console.error('Error sending user speaking event:', error);
        }
      }
    });

    // Send agent thinking events to frontend
    agent.on(AgentEvents.AgentThinking, () => {
      if (browserWs?.readyState === WebSocket.OPEN) {
        try {
          browserWs.send(JSON.stringify({
            type: 'agent_thinking',
            timestamp: Date.now()
          }));
        } catch (error) {
          console.error('Error sending agent thinking event:', error);
        }
      }
    });

    agent.on(AgentEvents.Audio, (audio: Buffer) => {
      if (browserWs?.readyState === WebSocket.OPEN) {
        try {
          // Send audio buffer directly as binary - no conversion for minimal latency
          browserWs.send(audio, { binary: true });
        } catch (error) {
          // Only log critical errors to minimize overhead
          console.error('Audio send error:', error);
        }
      }
    });

    agent.on(AgentEvents.Error, (error: Error) => {
      console.error('Agent error:', error);
    });

    agent.on(AgentEvents.Close, () => {
      console.log('Agent connection closed');
      if (browserWs?.readyState === WebSocket.OPEN) {
        browserWs.close();
      }
      // Persist transcript and update long-term memory asynchronously after session
      void persistSessionMemory(userId, transcript, candidateFacts);
    });

    return agent;
  } catch (error) {
    console.error('Error connecting to Deepgram:', error);
    process.exit(1);
  }
}

// Create WebSocket server for browser clients
const wss = new WebSocket.Server({ server });
let browserWs: WebSocket | null = null;

wss.on('connection', async (ws) => {
  console.log('Browser client connected');
  browserWs = ws;

  // For now we assume a single user; this can be replaced with a real user id
  const agent = await connectToAgent(DEFAULT_USER_ID);

  ws.on('message', (data: Buffer) => {
    try {
      if (agent) {
        // Send audio data directly to agent with no processing overhead
        // Convert Buffer to ArrayBuffer for compatibility
        agent.send(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
      }
    } catch (error) {
      console.error('Error sending audio to agent:', error);
    }
  });

  ws.on('close', async () => {
    if (agent) {
      await agent.disconnect();
    }
    browserWs = null;
    console.log('Browser client disconnected');
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
const serverInstance = server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

// Graceful shutdown handler
function shutdown() {
  console.log('\nShutting down server...');

  // Set a timeout to force exit if graceful shutdown takes too long
  const forceExit = setTimeout(() => {
    console.error('Force closing due to timeout');
    process.exit(1);
  }, 5000);

  // Track pending operations
  let pendingOps = {
    ws: true,
    http: true
  };

  // Function to check if all operations are complete
  const checkComplete = () => {
    if (!pendingOps.ws && !pendingOps.http) {
      clearTimeout(forceExit);
      console.log('Server shutdown complete');
      process.exit(0);
    }
  };

  // Close all WebSocket connections
  wss.clients.forEach((client) => {
    try {
      client.close();
    } catch (err) {
      console.error('Error closing WebSocket client:', err);
    }
  });

  wss.close((err) => {
    if (err) {
      console.error('Error closing WebSocket server:', err);
    } else {
      console.log('WebSocket server closed');
    }
    pendingOps.ws = false;
    checkComplete();
  });

  // Close the HTTP server
  serverInstance.close((err) => {
    if (err) {
      console.error('Error closing HTTP server:', err);
    } else {
      console.log('HTTP server closed');
    }
    pendingOps.http = false;
    checkComplete();
  });
}

// Handle shutdown signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

export default serverInstance;