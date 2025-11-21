export enum GameStage {
  BOOT = 'BOOT',
  BIOS = 'BIOS',
  PSYCH_EVAL = 'PSYCH_EVAL',
  LOADING_SCENE = 'LOADING_SCENE',
  PLAYING = 'PLAYING',
  ENDING = 'ENDING',
  ERROR = 'ERROR',
}

export interface PsychProfile {
  paranoia: number; // 0-100
  compliance: number; // 0-100
  aggression: number; // 0-100
  traits: string[];
  timestamp: number;
}

export interface MetaMemory {
  deathCount: number;
  endingsReached: string[];
  narrativeThreads: string[];
}

export interface StoryNode {
  id: string;
  narrative: string;
  visualPrompt: string;
  gameState: 'playing' | 'won' | 'lost';
  choices: {
    text: string;
    nextId: string; // or 'ending'
    effect?: string; // Description of effect on profile
  }[];
}

export interface ChatMessage {
  role: 'user' | 'model' | 'system';
  text: string;
  isTyping?: boolean;
}

export interface AppConfig {
  textModel: string;
  chatModel: string;
  imageModel: string;
  ttsModel: string;
  imageSize: '1K' | '2K' | '4K';
  audioEnabled: boolean;
  visualsEnabled: boolean;
}