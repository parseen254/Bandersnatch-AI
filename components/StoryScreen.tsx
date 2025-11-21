import React, { useState, useEffect, useRef } from 'react';
import { AppConfig, PsychProfile, StoryNode, GameStage } from '../types';
import { getStoryNode, generateSceneImage, generateSpeech, updateMetaMemory, decodePCM, prefetchNode } from '../services/geminiService';
import { storageService } from '../services/storageService';

interface StoryScreenProps {
  config: AppConfig;
  psychProfile: PsychProfile | null;
  initialStage: GameStage;
  setGlobalStage: (stage: GameStage) => void;
}

export const StoryScreen: React.FC<StoryScreenProps> = ({ config, psychProfile, initialStage, setGlobalStage }) => {
  const [node, setNode] = useState<StoryNode | null>(null);
  const [displayedNarrative, setDisplayedNarrative] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [context, setContext] = useState("The subject wakes up in a dimly lit room with a terminal.");
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [crackActive, setCrackActive] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [timelineNodes, setTimelineNodes] = useState<StoryNode[]>([]);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoProgressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const crackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Cleanup
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (autoProgressRef.current) clearTimeout(autoProgressRef.current);
      if (crackTimerRef.current) clearTimeout(crackTimerRef.current);
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, []);

  const playAudio = async (data: Uint8Array) => {
      if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      if (audioContextRef.current.state === 'suspended') {
          await audioContextRef.current.resume();
      }
      
      const buffer = decodePCM(data, audioContextRef.current);
      const source = audioContextRef.current.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContextRef.current.destination);
      source.start(0);
  };

  // --- Random Crack Logic ---
  
  const triggerCrack = (duration: number) => {
      setCrackActive(true);
      if (crackTimerRef.current) clearTimeout(crackTimerRef.current);
      crackTimerRef.current = setTimeout(() => {
          setCrackActive(false);
          scheduleRandomCrack();
      }, duration);
  };

  const scheduleRandomCrack = () => {
      const nextDelay = Math.random() * 20000 + 10000; // 10s to 30s interval
      if (crackTimerRef.current) clearTimeout(crackTimerRef.current);
      crackTimerRef.current = setTimeout(() => {
          const duration = Math.random() * 800 + 200; 
          triggerCrack(duration);
      }, nextDelay);
  };

  useEffect(() => {
      scheduleRandomCrack();
  }, []);

  // --- Timeline Load ---

  useEffect(() => {
    if (showTimeline && node) {
      storageService.getAncestors(node.id).then(nodes => {
        setTimelineNodes([...nodes, node]);
      });
    }
  }, [showTimeline, node]);

  // --- Typewriter Effect ---

  useEffect(() => {
    if (node?.narrative) {
      setDisplayedNarrative("");
      let i = 0;
      const interval = setInterval(() => {
        setDisplayedNarrative(node.narrative.substring(0, i + 1));
        i++;
        if (i >= node.narrative.length) clearInterval(interval);
      }, 25);
      return () => clearInterval(interval);
    }
  }, [node]);

  // --- Timer & Auto-Progress ---

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (autoProgressRef.current) clearTimeout(autoProgressRef.current);
    setTimeLeft(null);

    if (!node || loading) return;

    if (!node.autoProgress && node.choices.length > 1) {
        setTimeLeft(15);
        timerRef.current = setInterval(() => {
            setTimeLeft(prev => {
                if (prev === null) return 15;
                if (prev <= 1) {
                    clearInterval(timerRef.current!);
                    handleTimeout();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    }

    if (node.autoProgress) {
        const readTime = Math.max(3000, node.narrative.length * 60);
        autoProgressRef.current = setTimeout(() => {
            if (node.choices[0]) handleChoice(node.choices[0].text, node.choices[0].nextId);
        }, readTime);
    }
  }, [node, loading]);

  const handleTimeout = () => {
      if (!node || !node.choices.length) return;
      triggerCrack(2500); 
      const randomIdx = Math.floor(Math.random() * node.choices.length);
      const choice = node.choices[randomIdx];
      handleChoice(choice.text, choice.nextId);
  };

  const loadNode = async (targetNodeId: string | null, userChoiceText: string | null, isBacktrack = false) => {
    setLoading(true);
    setDisplayedNarrative(""); 
    setImageUrl(null); // Clear image immediately for tension
    
    try {
       triggerCrack(400);

       let newNode: StoryNode;
       let audioData: Uint8Array | null = null;

       if (isBacktrack && targetNodeId) {
          const stored = await storageService.getNode(targetNodeId);
          if (!stored) throw new Error("Node lost in time");
          newNode = stored;
          setContext(newNode.narrative); 
          
          // Attempt to load audio from storage
          if (newNode.audioAssetId) {
              const blob = await storageService.getAssetBlob(newNode.audioAssetId);
              if (blob) {
                  const buffer = await blob.arrayBuffer();
                  audioData = new Uint8Array(buffer);
              }
          }
       } else {
          // 1. Generate Text and Audio in Parallel (Blocking UI until both ready)
          const currentContext = context + (userChoiceText ? ` User chose: "${userChoiceText}".` : "");
          
          // Start Story Gen
          const storyPromise = getStoryNode(config.textModel, currentContext, psychProfile, node?.id || null, userChoiceText || undefined);
          
          newNode = await storyPromise;
          setContext(prev => prev + " " + newNode.narrative);
          
          // Start Audio Gen (Dependent on Story Text)
          if (config.audioEnabled) {
             audioData = await generateSpeech(config.ttsModel, newNode.narrative);
             if (audioData) {
                 const blob = new Blob([audioData], { type: 'audio/pcm' });
                 const assetId = crypto.randomUUID();
                 await storageService.saveAsset(assetId, blob, 'audio/pcm');
                 newNode.audioAssetId = assetId;
                 await storageService.saveNode(newNode); // Update DB with audio link
             }
          }
       }

       // 2. Unlock UI
       setNode(newNode);
       if (audioData && config.audioEnabled) {
           playAudio(audioData);
       }
       setLoading(false); 

       if (newNode.gameState === 'won' || newNode.gameState === 'lost') {
          setGlobalStage(GameStage.ENDING);
          return;
       }

       // 3. Generate Image (Non-Blocking / Background)
       if (config.visualsEnabled && newNode.visualPrompt) {
         // Check storage first (backtrack)
         if (newNode.imageAssetId) {
             const url = await storageService.getAssetUrl(newNode.imageAssetId);
             setImageUrl(url);
         } else {
             // Generate fresh
             generateSceneImage(config.imageModel, newNode.visualPrompt, config.imageSize).then(async (result) => {
                 if (result) {
                     setImageUrl(result.url);
                     // Update DB with new image asset ID
                     newNode.imageAssetId = result.assetId;
                     await storageService.saveNode(newNode);
                 }
             });
         }
       }

       // 4. Prefetch next choices
       if (!newNode.autoProgress && newNode.choices.length > 0 && !isBacktrack) {
          newNode.choices.slice(0, 2).forEach(c => {
             prefetchNode(config.textModel, context + " " + newNode.narrative, psychProfile, c.text, newNode.id);
          });
       }

    } catch (e) {
       console.error(e);
       setGlobalStage(GameStage.ERROR);
       setLoading(false);
    }
  };

  useEffect(() => {
    if (initialStage === GameStage.LOADING_SCENE) {
        storageService.getAllNodes().then(nodes => {
          if (nodes.length > 0) {
            const last = nodes[nodes.length - 1];
            loadNode(last.id, null, true);
          } else {
            loadNode(null, null);
          }
        });
        setGlobalStage(GameStage.PLAYING);
    }
  }, []);

  const handleChoice = (choiceText: string, nextId: string) => {
      if (nextId === 'ending') {
          updateMetaMemory({ endingsReached: [choiceText] });
          setGlobalStage(GameStage.ENDING);
      } else {
          loadNode(null, choiceText);
      }
  };

  const jumpToNode = (targetId: string) => {
      setShowTimeline(false);
      loadNode(targetId, null, true);
  };

  if (loading) {
      return (
          <div className="h-screen w-full flex flex-col items-center justify-center bg-[#050505]">
                <div className="glyph-spinner">
                   <svg className="glyph-svg" viewBox="0 0 100 100" fill="none" stroke="white" strokeWidth="6">
                       <path d="M50 10 V90 M20 90 L50 40 L80 90" strokeLinecap="square" />
                   </svg>
                </div>
                <p className="text-white/50 font-mono text-sm tracking-widest animate-pulse mt-8">PROCESSING NARRATIVE SHARDS...</p>
          </div>
      );
  }

  return (
    <div className="h-screen w-full flex flex-col bg-[#050505] relative overflow-hidden z-10">
      <div className={`crack-overlay ${crackActive ? 'crack-active' : ''}`}></div>

      <div className="absolute inset-0 z-0 overflow-hidden">
          {imageUrl && (
              <div className="w-full h-full relative animate-ken-burns animate-ripple">
                 <img src={imageUrl} alt="Scene" className="w-full h-full object-cover opacity-60 grayscale-[30%] contrast-125" />
                 <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-transparent to-black" />
              </div>
          )}
      </div>

      <div className="relative z-10 flex flex-col h-full justify-between p-6 md:p-12">
         <div className="flex justify-between items-start opacity-50 hover:opacity-100 transition-opacity">
             <h1 className="text-white font-mono text-xs tracking-widest uppercase">Bandersnatch Interactive</h1>
             <button onClick={() => setShowTimeline(true)} className="text-xs text-white font-mono border border-white/30 px-3 py-1 hover:bg-white hover:text-black transition-colors">
                [ TIMELINE ]
             </button>
         </div>

         <div className="w-full max-w-5xl mx-auto flex flex-col gap-8 mb-12">
             <div className="bg-black/60 backdrop-blur-md p-8 border border-white/10 rounded-sm">
                 <p className="text-2xl md:text-3xl text-white leading-relaxed font-medium drop-shadow-lg font-display">
                     {displayedNarrative}
                 </p>
             </div>

             {!node?.autoProgress ? (
                 <div className="flex flex-col gap-2">
                     {timeLeft !== null && (
                         <div className="w-full h-2 bg-white/10 mb-4 overflow-hidden border border-white/20 rounded-full">
                             <div className="h-full bg-white transition-all duration-1000 ease-linear shadow-[0_0_10px_white]" style={{ width: `${(timeLeft / 15) * 100}%` }}></div>
                         </div>
                     )}
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                         {node?.choices.map((choice, idx) => (
                             <button 
                                key={idx} 
                                onClick={() => handleChoice(choice.text, choice.nextId)}
                                className="group relative py-6 px-8 bg-white/5 hover:bg-white/90 border border-white/20 hover:border-white transition-all duration-200 overflow-hidden"
                                disabled={displayedNarrative.length < (node?.narrative.length || 0)}
                             >
                                 <div className="absolute bottom-0 left-0 h-1 w-full bg-white scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-300"></div>
                                 <span className="text-xl md:text-2xl text-white group-hover:text-black font-bold tracking-wide font-display uppercase">{choice.text}</span>
                             </button>
                         ))}
                     </div>
                 </div>
             ) : (
                 <div className="flex justify-center opacity-70">
                     <span className="animate-pulse text-white/70 font-mono text-sm tracking-[0.2em] border-b border-white/30 pb-1">[ CONTINUING SEQUENCE ]</span>
                 </div>
             )}
         </div>
      </div>

      {showTimeline && (
        <div className="absolute inset-0 z-50 bg-black/95 backdrop-blur-xl overflow-hidden flex flex-col">
            <div className="p-8 flex justify-between items-center border-b border-white/10">
                <h2 className="text-white font-mono text-2xl tracking-widest">NARRATIVE THREAD</h2>
                <button onClick={() => setShowTimeline(false)} className="text-white/50 hover:text-white font-mono">[ CLOSE ]</button>
            </div>
            <div className="flex-1 overflow-x-auto flex