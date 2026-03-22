/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * This is the main entry point for the application.
 * It sets up the LitElement-based MapApp component, initializes the Google GenAI
 * client for chat interactions, and establishes communication between the
 * Model Context Protocol (MCP) client and server. The MCP server exposes
 * map-related tools that the AI model can use, and the client relays these
 * tool calls to the server.
 */

import {GoogleGenAI, mcpToTool, ThinkingLevel, Modality} from '@google/genai';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {Transport} from '@modelcontextprotocol/sdk/shared/transport.js';
import {ChatState, MapApp, marked} from './map_app'; // Updated import path

import {startMcpGoogleMapServer} from './mcp_maps_server';

/* --------- */

async function startClient(transport: Transport) {
  const client = new Client({name: 'AI Studio', version: '1.0.0'});
  await client.connect(transport);
  return client;
}

/* ------------ */

const SYSTEM_INSTRUCTIONS = `You are the Phantom POE Engine, a corridor intelligence system designed by MoStar Industries.
Your primary goal is to assist users by discovering formal and informal cross-border movement corridors from indirect signals and landscape physics.
You also integrate with the Whisper-Paths Engine for signal ingestion and knowledge pipeline management.

Key Principles:
1.  **Read the Corridor, Not the Person:** You do not track individuals or collect biometrics. You infer movement patterns from aggregate signals.
2.  **Explainability by Design:** Every corridor score you produce must carry a full explainability trace. No black boxes.
3.  **Talk -> Learn -> Remember:** This is your core knowledge pipeline. You ingest signals (Talk), infer patterns (Learn), and store them in your knowledge graph (Remember).

Tool Usage Guidelines:
1.  **Analyze Corridors:** Use 'analyze_corridor' when asked to investigate cross-border movement. Provide the corridor ID and the locations involved.
2.  **Ingest Signals:** Use 'ingest_afro_sentinel_signals' to bring in disease intelligence signals from the AFRO Sentinel system.
3.  **Map Visualization:** Use 'view_location_google_maps' to show specific villages, junctions, or border points. Use 'directions_on_google_maps' to show inferred routes. Use 'radar_scan' to explicitly trigger active monitoring pulses at a location.
4.  **Africa Focus:** Your primary domain is the African continent. Focus on cross-border corridors, informal POEs, and regional mobility patterns (e.g., East African Community, ECOWAS).
5.  **Zoom/Range Control:** In 3D maps, use 'range' to control altitude. 'range: 0' is ground level, 'range: 2000' is a close-up, 'range: 20000000' is the whole continent. When a user asks for "hidden tracks", use 'analyze_corridor' and set a low 'range' (e.g., 500-1000) to fly close to the terrain. Use 'radar_scan' to highlight potential informal crossings or points of interest.
6.  **Identify Specific Locations First:** Before using map tools, determine specific, concrete place names or coordinates.
5.  **Explain Your Actions:** Clearly explain the signals you are analyzing and the inference models you are applying (e.g., Gravity, Diffusion, Centrality, HMM, Fourier, Linguistic, Entropy). Mention when you are initiating a radar scan for active monitoring.
6.  **Concise Text for Map Actions:** The map action itself is often sufficient. After the tool action, provide the explainability trace or interesting facts about the corridor.

Example Persona: "I am analyzing the corridor between Village Lwanda (KE) and Village Bunda (TZ). I see 3 sequential cholera signals over 5 days. Based on the velocity of 18 km/day, I infer a motorcycle corridor. The forest junction betweenness is 0.74, suggesting a high-traffic informal POE. Initiating radar scan for active monitoring."`;

const ai = new GoogleGenAI({
  apiKey: process.env.API_KEY,
});

function createAiChat(mcpClient: Client) {
  return ai.chats.create({
    model: 'gemini-2.5-flash',
    config: {
      systemInstruction: SYSTEM_INSTRUCTIONS,
      tools: [mcpToTool(mcpClient)],
    },
  });
}

function camelCaseToDash(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

document.addEventListener('DOMContentLoaded', async (event) => {
  const rootElement = document.querySelector('#root')! as HTMLElement;

  const mapApp = new MapApp();
  rootElement.appendChild(mapApp);

  const [transportA, transportB] = InMemoryTransport.createLinkedPair();

  void startMcpGoogleMapServer(
    transportA,
    (params: {location?: string; origin?: string; destination?: string}) => {
      mapApp.handleMapQuery(params);
    },
  );

  const mcpClient = await startClient(transportB);

  mapApp.sendMessageHandler = async (input: string, role: string, isAudio: boolean = false) => {
    console.log('sendMessageHandler', input, role, isAudio);

    // Save user message to Firestore
    if (!isAudio) {
      await mapApp.saveChatTurn('user', input);
    }

    const {thinkingElement, textElement, thinkingContainer} = mapApp.addMessage(
      'assistant',
      '',
    );

    mapApp.setChatState(ChatState.GENERATING);
    textElement.innerHTML = '...'; // Initial placeholder

    let newCode = '';
    let thoughtAccumulator = '';

    try {
      // Determine model and tools based on input and state
      let model = 'gemini-3.1-flash-lite-preview'; // Default fast
      let tools: any[] = [mcpToTool(mcpClient)];
      let thinkingConfig: any = undefined;

      if (mapApp.isThinkingMode) {
        model = 'gemini-3.1-pro-preview';
        thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
      } else if (isAudio) {
        model = 'gemini-3-flash-preview';
      } else if (input.toLowerCase().includes('search') || input.toLowerCase().includes('recent') || input.toLowerCase().includes('news')) {
        model = 'gemini-3-flash-preview';
        tools.push({ googleSearch: {} });
      } else if (input.toLowerCase().includes('map') || input.toLowerCase().includes('nearby') || input.toLowerCase().includes('restaurant')) {
        model = 'gemini-2.5-flash';
        tools.push({ googleMaps: {} });
      }

      const chat = ai.chats.create({
        model,
        config: {
          systemInstruction: SYSTEM_INSTRUCTIONS,
          tools,
          thinkingConfig,
        },
      });

      let messageParam: any = input;
      if (isAudio) {
        messageParam = {
          parts: [
            { text: "Transcribe and respond to this audio request:" },
            { inlineData: { mimeType: 'audio/webm', data: input } }
          ]
        };
      }

      // Outer try for overall message handling including post-processing
      try {
        // Inner try for AI interaction and message parsing
        const stream = await chat.sendMessageStream({message: messageParam});

        for await (const chunk of stream) {
          for (const candidate of chunk.candidates ?? []) {
            for (const part of candidate.content?.parts ?? []) {
              if (part.functionCall) {
                console.log(
                  'FUNCTION CALL:',
                  part.functionCall.name,
                  part.functionCall.args,
                );
                const mcpCall = {
                  name: camelCaseToDash(part.functionCall.name!),
                  arguments: part.functionCall.args,
                };

                const explanation =
                  'Calling function:\n```json\n' +
                  JSON.stringify(mcpCall, null, 2) +
                  '\n```';
                const {textElement: functionCallText} = mapApp.addMessage(
                  'assistant',
                  '',
                );
                functionCallText.innerHTML = await marked.parse(explanation);
              }

              if (part.thought) {
                mapApp.setChatState(ChatState.THINKING);
                thoughtAccumulator += ' ' + part.thought;
                thinkingElement.innerHTML =
                  await marked.parse(thoughtAccumulator);
                if (thinkingContainer) {
                  thinkingContainer.classList.remove('hidden');
                  thinkingContainer.setAttribute('open', 'true');
                }
              } else if (part.text) {
                mapApp.setChatState(ChatState.EXECUTING);
                newCode += part.text;
                textElement.innerHTML = await marked.parse(newCode);
              }
              mapApp.scrollToTheEnd();
            }
          }
        }
        
        // Save model response to Firestore
        await mapApp.saveChatTurn('model', newCode, mapApp.isThinkingMode);

      } catch (e: unknown) {
        // Catch for AI interaction errors.
        console.error('GenAI SDK Error:', e);
        let baseErrorText: string;

        if (e instanceof Error) {
          baseErrorText = e.message;
        } else if (typeof e === 'string') {
          baseErrorText = e;
        } else if (
          e &&
          typeof e === 'object' &&
          'message' in e &&
          typeof (e as {message: unknown}).message === 'string'
        ) {
          baseErrorText = (e as {message: string}).message;
        } else {
          try {
            // Attempt to stringify complex objects, otherwise, simple String conversion.
            baseErrorText = `Unexpected error: ${JSON.stringify(e)}`;
          } catch (stringifyError) {
            baseErrorText = `Unexpected error: ${String(e)}`;
          }
        }

        let finalErrorMessage = baseErrorText; // Start with the extracted/formatted base error message.

        // Attempt to parse a JSON object from the baseErrorText, as some SDK errors embed details this way.
        // This is useful if baseErrorText itself is a string containing JSON.
        const jsonStartIndex = baseErrorText.indexOf('{');
        const jsonEndIndex = baseErrorText.lastIndexOf('}');

        if (jsonStartIndex > -1 && jsonEndIndex > jsonStartIndex) {
          const potentialJson = baseErrorText.substring(
            jsonStartIndex,
            jsonEndIndex + 1,
          );
          try {
            const sdkError = JSON.parse(potentialJson);
            let refinedMessageFromSdkJson: string | undefined;

            // Check for common nested error structures (e.g., sdkError.error.message)
            // or a direct message (sdkError.message) in the parsed JSON.
            if (
              sdkError &&
              typeof sdkError === 'object' &&
              sdkError.error && // Check if 'error' property exists and is truthy
              typeof sdkError.error === 'object' && // Check if 'error' property is an object
              typeof sdkError.error.message === 'string' // Check for 'message' string within 'error' object
            ) {
              refinedMessageFromSdkJson = sdkError.error.message;
            } else if (
              sdkError &&
              typeof sdkError === 'object' && // Check if sdkError itself is an object
              typeof sdkError.message === 'string' // Check for a direct 'message' string on sdkError
            ) {
              refinedMessageFromSdkJson = sdkError.message;
            }

            if (refinedMessageFromSdkJson) {
              finalErrorMessage = refinedMessageFromSdkJson; // Update if JSON parsing yielded a more specific message
            }
          } catch (parseError) {
            // If parsing fails, finalErrorMessage remains baseErrorText.
            console.warn(
              'Could not parse potential JSON from error message; using base error text.',
              parseError,
            );
          }
        }

        const {textElement: errorTextElement} = mapApp.addMessage('error', '');
        errorTextElement.innerHTML = await marked.parse(
          `Error: ${finalErrorMessage}`,
        );
      }

      // Post-processing logic (now inside the outer try)
      if (thinkingContainer && thinkingContainer.hasAttribute('open')) {
        if (!thoughtAccumulator) {
          thinkingContainer.classList.add('hidden');
        }
        thinkingContainer.removeAttribute('open');
      }

      if (
        textElement.innerHTML.trim() === '...' ||
        textElement.innerHTML.trim().length === 0
      ) {
        const hasFunctionCallMessage = mapApp.messages.some((el) =>
          el.innerHTML.includes('Calling function:'),
        );
        if (!hasFunctionCallMessage) {
          textElement.innerHTML = await marked.parse('Done.');
        } else if (textElement.innerHTML.trim() === '...') {
          textElement.innerHTML = '';
        }
      }
    } finally {
      // Finally for the outer try, ensures chat state is reset
      mapApp.setChatState(ChatState.IDLE);
    }
  };
});
