import { GoogleGenAI, Type, Modality, Schema, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { PsychProfile, StoryNode, MetaMemory } from '../types';

let genAI: GoogleGenAI | null = null;

export const initializeGemini = (apiKey: string) => {
  genAI = new GoogleGenAI({ apiKey });
};

export const getGeminiInstance = () => {
  if (!genAI) {
    const storedKey = localStorage.getItem('BANDERSNATCH_API_KEY');
    if (storedKey) {
      initializeGemini(storedKey);
    }
  }
  
  if (!genAI) {
    throw new Error("Gemini AI not initialized. Please provide an API Key.");
  }
  return genAI;
};

const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

const cleanJson = (text: string) => {
  try {
    // Remove markdown code blocks if present
    let cleaned = text.replace(/```json\s*/g, '').replace(/```\s*$/g, '');
    // Sometimes the model adds extra text before or after
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }
    return cleaned;
  } catch (e) {
    return text;
  }
};

// --- Audio Helpers ---

export const decodePCM = (data: Uint8Array, ctx: AudioContext): AudioBuffer => {
  const inputSampleRate = 24000;
  const numChannels = 1;
  
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length;
  const buffer = ctx.createBuffer(numChannels, frameCount, inputSampleRate);
  
  const channelData = buffer.getChannelData(0);
  for (let i = 0; i < frameCount; i++) {
    // Convert 16-bit int to float [-1.0, 1.0]
    channelData[i] = dataInt16[i] / 32768.0;
  }
  
  return buffer;
};

// --- Persistence & Helpers ---

export const clearAllData = () => {
  localStorage.removeItem('BANDERSNATCH_API_KEY');
  localStorage.removeItem('BANDERSNATCH_PSYCH_PROFILE');
  localStorage.removeItem('BANDERSNATCH_META_MEMORY');
  // Note: window.location.reload() removed to prevent React state crash.
  // State must be cleared by the calling component.
};

export const getStoredProfile = (): PsychProfile | null => {
  try {
    const stored = localStorage.getItem('BANDERSNATCH_PSYCH_PROFILE');
    if (stored) return JSON.parse(stored);
  } catch (e) {
    return null;
  }
  return null;
};

export const isProfileFresh = (profile: PsychProfile | null): boolean => {
  if (!profile) return false;
  const now = Date.now();
  const diff = now - profile.timestamp;
  const twentyFourHours = 24 * 60 * 60 * 1000;
  return diff < twentyFourHours;
};

// --- Meta Memory ---

export const getMetaMemory = (): MetaMemory => {
  try {
    const stored = localStorage.getItem('BANDERSNATCH_META_MEMORY');
    if (stored) return JSON.parse(stored);
  } catch (e) {
    console.warn("Failed to parse meta memory, resetting.");
  }
  return { deathCount: 0, endingsReached: [], narrativeThreads: [] };
};

export const updateMetaMemory = (update: Partial<MetaMemory>) => {
  const current = getMetaMemory();
  const newMemory = { ...current, ...update };
  localStorage.setItem('BANDERSNATCH_META_MEMORY', JSON.stringify(newMemory));
  return newMemory;
};

// --- Psych Eval Chat ---

export const generateDirectorResponse = async (
  model: string,
  history: { role: string; parts: { text: string }[] }[],
  lastUserMessage: string
) => {
  const ai = getGeminiInstance();
  
  const chatHistory = history.map(h => ({
    role: h.role,
    parts: h.parts
  }));

  const chat = ai.chats.create({
    model: model,
    history: chatHistory,
    config: {
      temperature: 1.0,
      systemInstruction: "You are THE DIRECTOR. A cold, manipulative AI from 1984. You are interviewing a subject for a psychological experiment. Be cryptic, unsettling, and meta-aware. Ask probing questions about reality, control, and violence. Do not be polite. CRITICAL: Your response must be EXACTLY ONE SENTENCE long. No exceptions.",
      safetySettings: SAFETY_SETTINGS,
    },
  });

  const result = await chat.sendMessage({ message: lastUserMessage });
  return result.text;
};

export const generatePsychProfile = async (model: string, conversationText: string): Promise<PsychProfile> => {
  const ai = getGeminiInstance();
  
  const prompt = `Analyze this conversation and generate a psychological profile for the user based on their susceptibility to manipulation, paranoia, and violence.
  Conversation:
  ${conversationText}
  
  Output JSON with:
  - paranoia (0-100)
  - compliance (0-100)
  - aggression (0-100)
  - traits (array of 3 strings like "Delusional", "Submissive", "Volatile")
  `;

  const response = await ai.models.generateContent({
    model: model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      safetySettings: SAFETY_SETTINGS,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          paranoia: { type: Type.INTEGER },
          compliance: { type: Type.INTEGER },
          aggression: { type: Type.INTEGER },
          traits: { 
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        },
        required: ["paranoia", "compliance", "aggression", "traits"]
      }
    }
  });

  const text = response.text;
  if (!text) throw new Error("Failed to generate profile");
  const profile = JSON.parse(cleanJson(text)) as PsychProfile;
  
  // Add timestamp and save
  const profileWithTime = { ...profile, timestamp: Date.now() };
  localStorage.setItem('BANDERSNATCH_PSYCH_PROFILE', JSON.stringify(profileWithTime));
  
  return profileWithTime;
};

// --- Story Generation ---

export const generateStoryNode = async (
  model: string,
  context: string,
  psychProfile: PsychProfile | null
): Promise<StoryNode> => {
  const ai = getGeminiInstance();
  const metaMemory = getMetaMemory();

  const profileContext = psychProfile 
    ? `SUBJECT PROFILE: Paranoia ${psychProfile.paranoia}%, Compliance ${psychProfile.compliance}%, Aggression ${psychProfile.aggression}%. Traits: ${psychProfile.traits.join(', ')}.`
    : "SUBJECT PROFILE: Unknown.";

  const metaContext = `
  META_MEMORY (Previous Attempts):
  - Deaths: ${metaMemory.deathCount}
  - Endings Found: ${metaMemory.endingsReached.join(', ')}
  `;

  const prompt = `
  You are the engine of "BANDERSNATCH", an interactive text adventure from 1984 that is secretly a psychological test.
  
  ${metaContext}
  ${profileContext}
  
  INSTRUCTIONS:
  - Narrate in SECOND PERSON ("You...").
  - Style: 1980s Cyberpunk / Psychological Horror / Meta-Fiction.
  - Break the fourth wall subtly. If the user has high paranoia, feed it.
  - If the user has died many times, mock them.
  - Keep narration SHORT and PUNCHY (max 80 words).
  - Provide 2 distinct choices. One should often feel like a trap or a test of their profile traits.
  - visualPrompt: Generate a prompt for a dark, 80s retro-futuristic, VHS-style glitch art image of the scene.
  
  PREVIOUS CONTEXT: ${context}
  
  Generate valid JSON:
  `;

  const response = await ai.models.generateContent({
    model: model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      safetySettings: SAFETY_SETTINGS,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          narrative: { type: Type.STRING },
          visualPrompt: { type: Type.STRING },
          gameState: { type: Type.STRING, enum: ["playing", "won", "lost"] },
          choices: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING },
                nextId: { type: Type.STRING },
              }
            }
          }
        },
        required: ["id", "narrative", "visualPrompt", "choices", "gameState"]
      }
    }
  });

  const text = response.text;
  if (!text) throw new Error("Failed to generate story node");
  const node = JSON.parse(cleanJson(text)) as StoryNode;
  
  // Auto-update death count if lost
  if (node.gameState === 'lost') {
    updateMetaMemory({ deathCount: metaMemory.deathCount + 1 });
  }

  return node;
};

// --- Image Generation ---

export const generateSceneImage = async (model: string, prompt: string, size: '1K' | '2K' | '4K' = '1K'): Promise<string | null> => {
  const ai = getGeminiInstance();
  
  try {
    // Force aspect ratio to 4:3 for that TV feel
    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [{ text: prompt + " aesthetic of 1984, CRT monitor style, dark, glitchy, vhs tape artifacting" }]
      },
      config: {
        imageConfig: {
          imageSize: size,
          aspectRatio: "4:3" 
        },
        safetySettings: SAFETY_SETTINGS,
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
    return null;
  } catch (error) {
    console.error("Image generation failed:", error);
    return null;
  }
};

// --- Text to Speech ---

export const generateSpeech = async (model: string, text: string): Promise<Uint8Array | null> => {
  const ai = getGeminiInstance();

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: { parts: [{ text }] },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Puck' } // Puck has a deeper, more suitable tone
          }
        }
      }
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
       const binaryString = atob(base64Audio);
       const len = binaryString.length;
       const bytes = new Uint8Array(len);
       for (let i = 0; i < len; i++) {
         bytes[i] = binaryString.charCodeAt(i);
       }
       return bytes;
    }
    return null;

  } catch (error) {
    console.error("TTS generation failed:", error);
    return null;
  }
};