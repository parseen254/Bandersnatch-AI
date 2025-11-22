
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

// Exportable format
export interface StoryLine {
  version: number;
  timestamp: number;
  profile: PsychProfile | null;
  memory: MetaMemory;
  nodes: StoryNode[]; // Flattened tree
  assets: Record<string, { mimeType: string; data: string }>; // Base64 encoded assets for portability
}

export interface AssetRef {
  id: string;
  type: 'image' | 'audio';
  mimeType: string;
}

export interface StoryNode {
  id: string;
  parentId: string | null; // Linked List / Tree structure
  timestamp: number;
  
  narrative: string;
  visualPrompt: string;
  
  // Assets are stored separately in IDB to save space in JSON exports
  imageAssetId?: string; 
  audioAssetId?: string;

  gameState: 'playing' | 'won' | 'lost';
  autoProgress?: boolean;
  choices: {
    text: string;
    nextId: string; 
    effect?: string; 
  }[];
  
  // Runtime only
  prefetched?: boolean;
  imageUrl?: string; // Blob URL
  audioUrl?: string; // Blob URL
}

export interface ChatMessage {
  role: 'user' | 'model' | 'system';
  text: string;
  systemLog?: string;
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
