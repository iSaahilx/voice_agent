# Node Voice Agent Starter

Start building interactive voice experiences with Deepgram's Voice Agent API using this Node.js starter application. This project demonstrates how to create a voice agent that can engage in natural conversations using Deepgram's advanced AI capabilities.

## What is Deepgram?

[Deepgram's](https://deepgram.com/) voice AI platform provides APIs for speech-to-text, text-to-speech, and full speech-to-speech voice agents. Over 200,000+ developers use Deepgram to build voice AI products and features.

## Prerequisites

Before you begin, ensure you have:
- Node.js 18 or higher installed
- npm (comes with Node.js)
- A Deepgram API key (see below)
- A Gemini API key (configured in Deepgram Console for low-latency responses)

## Quickstart

Follow these steps to get started with this starter application.

### Clone the repository

Go to GitHub and [clone the repository](https://github.com/deepgram-starters/node-voice-agent).

### Install dependencies

Install the project dependencies:

```bash
npm install
```

### Create a `.env` config file

Copy the code from `sample.env` and create a new file called `.env`. Paste in the code and enter your API key you generated in the [Deepgram Console](https://console.deepgram.com/).

```
DEEPGRAM_API_KEY=your_deepgram_api_key_here
```

### Configure Gemini API Key

To use Gemini Flash 2.5 for ultra-fast responses, you need to configure your Gemini API key in the [Deepgram Console](https://console.deepgram.com/):

1. Go to your Deepgram Console
2. Navigate to Settings → API Keys
3. Add your Gemini API key (you can get one from [Google AI Studio](https://makersuite.google.com/app/apikey))

The voice agent is configured to use `flash2.5` by default for the lowest latency responses.

### Run the application

Start the server with:

```bash
npm start
```

Then open your browser and go to:

```
http://localhost:3000
```

- Allow microphone access when prompted.
- Click "Start Conversation" to begin.
- Speak into your microphone to interact with the Deepgram Voice Agent.
- You should see real-time transcriptions of both your speech and the agent's responses.
- You should hear the agent's responses played back in your browser.

### Run with Docker (e.g. on Render)

You can also run this app in a container:

```bash
docker build -t node-voice-agent .
docker run -p 3000:3000 -e DEEPGRAM_API_KEY=your_key_here node-voice-agent
```

For Render:
- Create a new **Web Service** from this repo
- Select **Docker** as the runtime
- Set the **Dockerfile path** to `Dockerfile`
- Set `DEEPGRAM_API_KEY` in Render environment variables
- Render will automatically use port `3000` exposed by the container

## Low-Latency Optimizations

This implementation is optimized for the lowest possible latency:

- **16kHz Audio**: Uses 16kHz sample rate for smaller audio chunks and faster processing
- **Nova-2 STT Model**: Deepgram's Nova-2 model optimized for low latency
- **Gemini Flash 2.5**: Fastest LLM model for rapid response generation
- **Aura-2 TTS**: Low-latency text-to-speech model
- **Minimal Prompt**: Short system prompt for faster LLM processing
- **Streaming Architecture**: Fully streaming end-to-end pipeline
- **40ms Audio Chunks**: Sends audio every 40ms for minimal buffering delay
- **Real-time UI**: Displays transcriptions and responses as they occur

## Using Cursor & MDC Rules

This application can be modify as needed by using the [app-requirements.mdc](.cursor/rules/app-requirements.mdc) file. This file allows you to specify various settings and parameters for the application in a structured format that can be use along with [Cursor's](https://www.cursor.com/) AI Powered Code Editor.

### Using the `app-requirements.mdc` File

1. Clone or Fork this repo.
2. Modify the `app-requirements.mdc`
3. Add the necessary configuration settings in the file.
4. You can refer to the MDC file used to help build this starter application by reviewing  [app-requirements.mdc](.cursor/rules/app-requirements.mdc)

## Testing

Test the application with:

```bash
npm run test
```

## Getting Help

- Join our [Discord community](https://discord.gg/deepgram) for support
- Found a bug? [Create an issue](https://github.com/deepgram-starters/node-voice-agent/issues)
- Have a feature request? [Submit it here](https://github.com/deepgram-starters/node-voice-agent/issues)

## Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

## Security

For security concerns, please review our [Security Policy](SECURITY.md).

## Code of Conduct

This project adheres to a [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## License

This project is licensed under the terms specified in [LICENSE](LICENSE).