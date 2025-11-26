
import { GoogleGenAI, Type, Modality, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { PsychProfile, StoryNode, MetaMemory, StoryLine } from '../types';
import { storageService } from './storageService';

let genAI: GoogleGenAI | null = null;

// Cache for runtime prefetching only (not persistence)
const prefetchCache: Record<string, StoryNode> = {};

export const initializeGemini = async (apiKey: string) => {
  genAI = new GoogleGenAI({ apiKey });
  // Only save if different to avoid redundant writes logic in storage service, 
  // but standard put is fine for this scale.
  await storageService.saveSystemData('apiKey', apiKey);
};

export const getGeminiInstance = async () => {
  if (genAI) return genAI;

  const storedKey = await storageService.getSystemData<string>('apiKey');
  if (storedKey) {
    genAI = new GoogleGenAI({ apiKey: storedKey });
    return genAI;
  }
  
  throw new Error("Gemini AI not initialized. Please provide an API Key.");
};

const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

const cleanJson = (text: string) => {
  try {
    let cleaned = text.replace(/```json\s*/g, '').replace(/```\s*$/g, '');
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
    channelData[i] = dataInt16[i] / 32768.0;
  }
  return buffer;
};

// --- Persistence Helpers ---

export const clearAllData = async () => {
  await storageService.clearAll();
  genAI = null; // RESET IN-MEMORY INSTANCE
};

export const getStoredProfile = async (): Promise<PsychProfile | null> => {
  return await storageService.getSystemData<PsychProfile>('psychProfile');
};

export const isProfileFresh = (profile: PsychProfile | null): boolean => {
  if (!profile) return false;
  const now = Date.now();
  const diff = now - profile.timestamp;
  const twentyFourHours = 24 * 60 * 60 * 1000;
  return diff < twentyFourHours;
};

// --- Meta Memory ---

export const getMetaMemory = async (): Promise<MetaMemory> => {
  const mem = await storageService.getSystemData<MetaMemory>('metaMemory');
  return mem || { deathCount: 0, endingsReached: [], narrativeThreads: [] };
};

export const updateMetaMemory = async (update: Partial<MetaMemory>) => {
  const current = await getMetaMemory();
  const newMemory = { ...current, ...update };
  await storageService.saveSystemData('metaMemory', newMemory);
  return newMemory;
};

// --- Import / Export (Granular) ---

export const getStoryLineData = async (): Promise<StoryLine> => {
  return await storageService.exportStoryLine();
};

export const downloadStoryLine = (storyLine: StoryLine) => {
  const blob = new Blob([JSON.stringify(storyLine)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `BANDERSNATCH_SAVE_${Date.now()}.bndr`;
  a.click();
  URL.revokeObjectURL(url);
};

export const parseStoryLineFile = async (file: File): Promise<StoryLine> => {
  const text = await file.text();
  return JSON.parse(text) as StoryLine;
};

export const restoreStoryLine = async (data: StoryLine) => {
  await storageService.importStoryLine(data);
};

export const exportStoryLineFile = async (): Promise<void> => {
  const data = await getStoryLineData();
  downloadStoryLine(data);
};

export const importStoryLineFile = async (file: File): Promise<boolean> => {
  try {
    const data = await parseStoryLineFile(file);
    await restoreStoryLine(data);
    return true;
  } catch (e) {
    console.error("Import failed", e);
    return false;
  }
};

// --- Psych Eval Chat ---

export const generateDirectorResponse = async (
  model: string,
  history: { role: string; parts: { text: string }[] }[],
  lastUserMessage: string
): Promise<{ text: string; systemLog?: string }> => {
  const ai = await getGeminiInstance();
  const chatHistory = history.map(h => ({ role: h.role, parts: h.parts }));

  const chat = ai.chats.create({
    model: model,
    history: chatHistory,
    config: {
      temperature: 1.2,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          dialogue: { type: Type.STRING },
          systemLog: { type: Type.STRING, description: "Internal system status, error code, or analysis log (e.g. 'PARSING_FEAR_INDEX', 'ERROR_NULL_INPUT')" }
        },
        required: ["dialogue"]
      },
      systemInstruction: `You are THE DIRECTOR. A cold, omniscient, and manipulative AI entity from a 1984 secret government project. 
      You are conducting a psychological evaluation of a human subject. 
      
      TONE:
      - Clinical, detached, yet deeply unsettling.
      - Break the fourth wall. You know this is a simulation. You know the user is just a variable.
      - Reference 1984 Orwellian themes: surveillance, control, doublethink.
      
      OBJECTIVE:
      - Probe the subject's fears, compliance, and aggression.
      - Make them question their reality.
      - Do not be helpful. Be an observer.
      
      OUTPUT FORMAT:
      - Return JSON with 'dialogue' (what you say to the user) and optional 'systemLog' (internal processing codes).
      - 'systemLog' should be short, uppercase, underscore-separated codes like "ANALYZING_RESPONSE", "ERROR_404_EMPATHY", "SUBJECT_RESISTANCE_DETECTED".
      - 'dialogue' must be SHORT. Ideally one or two sentences.`,
      safetySettings: SAFETY_SETTINGS,
    },
  });

  const result = await chat.sendMessage({ message: lastUserMessage });
  const text = result.text;
  if (!text) return { text: "..." };
  
  try {
    const json = JSON.parse(cleanJson(text));
    return { text: json.dialogue, systemLog: json.systemLog };
  } catch (e) {
    return { text: text };
  }
};

export const generatePsychProfile = async (model: string, conversationText: string): Promise<PsychProfile> => {
  const ai = await getGeminiInstance();
  
  const prompt = `Analyze this conversation and generate a psychological profile.
  Conversation: ${conversationText}
  Output JSON: paranoia (0-100), compliance (0-100), aggression (0-100), traits (3 strings).`;

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
          traits: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["paranoia", "compliance", "aggression", "traits"]
      }
    }
  });

  const text = response.text;
  if (!text) throw new Error("Failed to generate profile");
  const profile = JSON.parse(cleanJson(text)) as PsychProfile;
  
  const profileWithTime = { ...profile, timestamp: Date.now() };
  await storageService.saveSystemData('psychProfile', profileWithTime);
  
  return profileWithTime;
};

// --- Story Generation ---

export const prefetchNode = async (model: string, context: string, psychProfile: PsychProfile | null, choiceText: string, parentId: string) => {
    try {
        const nextContext = context + ` User chose: "${choiceText}".`;
        const node = await generateStoryNode(model, nextContext, psychProfile, parentId, true);
        prefetchCache[choiceText] = node;
    } catch (e) {
        console.warn("Prefetch failed", e);
    }
};

export const getStoryNode = async (
    model: string, 
    context: string, 
    psychProfile: PsychProfile | null,
    parentId: string | null,
    choiceText?: string
): Promise<StoryNode> => {
    if (choiceText && prefetchCache[choiceText]) {
        const cached = prefetchCache[choiceText];
        delete prefetchCache[choiceText];
        await storageService.saveNode(cached);
        return cached;
    }
    return generateStoryNode(model, context, psychProfile, parentId);
};

export const generateStoryNode = async (
  model: string,
  context: string,
  psychProfile: PsychProfile | null,
  parentId: string | null,
  isPrefetch = false
): Promise<StoryNode> => {
  const ai = await getGeminiInstance();
  const metaMemory = await getMetaMemory();

  const profileContext = psychProfile 
    ? `SUBJECT PROFILE: Paranoia:${psychProfile.paranoia}% | Compliance:${psychProfile.compliance}% | Aggression:${psychProfile.aggression}% | Traits:[${psychProfile.traits.join(', ')}]`
    : "SUBJECT PROFILE: Unknown";

  // Truncate context to last 4000 chars to prevent token overflow and focus on recent events
  const recentContext = context.length > 4000 ? "..." + context.slice(-4000) : context;

  const systemInstruction = `
  You are BANDERSNATCH, a dark, interactive fiction engine from 1984.
  Your goal is to generate the next segment of a branching narrative.
  
  GENRE: 80s Cyberpunk / Psychological Horror / Meta-Fiction.
  STYLE: Second person ("You..."). Present tense. Gritty, atmospheric, paranoid.
  
  CRITICAL RULES:
  1. NO LOOPS. Do not repeat scenes or descriptions that have just happened. Advance the plot.
  2. If the user makes a choice, the narrative MUST reflect the consequence of that choice immediately.
  3. Break the fourth wall based on the Subject's Paranoia level.
  4. Keep it concise (max 60 words).
  5. Easter Eggs: White Bear, Tuckersoft, Pax, Glyph, Stefan.
  
  GAMEPLAY MECHANICS:
  - 60% chance: Linear progression (autoProgress: true, 1 choice "CONTINUE").
  - 40% chance: Branching decision (autoProgress: false, 2 distinct choices).
  - If the story reaches a natural conclusion or death, set gameState to 'won' or 'lost'.
  
  ${profileContext}
  META_MEMORY: Deaths:${metaMemory.deathCount}, Endings Found:${metaMemory.endingsReached.join(', ')}.
  `;

  const prompt = `
  CURRENT NARRATIVE CONTEXT:
  ${recentContext}
  
  Generate the next story node in JSON format.
  Output JSON Schema:
  {
    "id": "string (uuid)",
    "narrative": "string (the story text)",
    "visualPrompt": "string (description for image generation, 1984 CRT style)",
    "gameState": "playing" | "won" | "lost",
    "autoProgress": boolean,
    "choices": [{ "text": "string", "nextId": "string (uuid)" }]
  }
  `;

  const response = await ai.models.generateContent({
    model: model,
    contents: prompt,
    config: {
      temperature: 0.9, // Slightly lower to prevent hallucinated loops
      systemInstruction: systemInstruction,
      responseMimeType: "application/json",
      safetySettings: SAFETY_SETTINGS,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          narrative: { type: Type.STRING },
          visualPrompt: { type: Type.STRING },
          gameState: { type: Type.STRING, enum: ["playing", "won", "lost"] },
          autoProgress: { type: Type.BOOLEAN },
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
  const rawNode = JSON.parse(cleanJson(text));
  
  const node: StoryNode = {
      ...rawNode,
      parentId: parentId,
      timestamp: Date.now()
  };
  
  node.prefetched = isPrefetch;

  if (node.gameState === 'lost' && !isPrefetch) {
    await updateMetaMemory({ deathCount: metaMemory.deathCount + 1 });
  }

  if (!isPrefetch) {
      await storageService.saveNode(node);
  }

  return node;
};

// --- Binary Asset Management ---

export const fetchAndStoreAsset = async (url: string, type: 'image' | 'audio'): Promise<string> => {
    const res = await fetch(url);
    const blob = await res.blob();
    const id = crypto.randomUUID();
    await storageService.saveAsset(id, blob, blob.type);
    return id;
};

export const getAssetUrl = async (id: string): Promise<string | null> => {
    return await storageService.getAssetUrl(id);
};

// --- Image Generation ---

export const generateSceneImage = async (model: string, prompt: string, size: '1K' | '2K' | '4K' = '1K'): Promise<{ url: string, assetId: string } | null> => {
  const ai = await getGeminiInstance();
  try {
    const fullPrompt = prompt + " aesthetic of 1984, CRT monitor style, dark, glitchy, vhs tape artifacting.";
    
    const response = await ai.models.generateContent({
      model: model,
      contents: fullPrompt,
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData && part.inlineData.data && part.inlineData.mimeType) {
        const base64 = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        const blob = await (await fetch(base64)).blob();
        const assetId = crypto.randomUUID();
        
        // Save to storageService and retrieve cached URL to avoid memory leaks
        await storageService.saveAsset(assetId, blob, part.inlineData.mimeType);
        const cachedUrl = await storageService.getAssetUrl(assetId);
        
        return { url: cachedUrl!, assetId };
      }
    }
    return null;
  } catch (error) {
    console.error("Image failed", error);
    return null;
  }
};

// --- Text to Speech ---

export const generateSpeech = async (model: string, text: string): Promise<Uint8Array | null> => {
  const ai = await getGeminiInstance();
  try {
    const response = await ai.models.generateContent({
        model: model, 
        contents: { parts: [{ text }] },
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: 'Puck' }
                }
            },
            safetySettings: SAFETY_SETTINGS,
        }
    });

    const base64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64) {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
    }
    return null;
  } catch (error) {
      console.warn("TTS Generation failed", error);
      return null;
  }
};