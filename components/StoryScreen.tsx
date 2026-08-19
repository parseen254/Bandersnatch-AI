
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
  const [isTyping, setIsTyping] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [context, setContext] = useState("The subject wakes up in a dimly lit room with a terminal.");
  const [crackState, setCrackState] = useState<'none' | 'low' | 'high'>('none');
  const [showTimeline, setShowTimeline] = useState(false);
  const [timelineNodes, setTimelineNodes] = useState<StoryNode[]>([]);
  const [instability, setInstability] = useState(0); // 0 to 10

  const crackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const randomCrackLoopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const currentRequestRef = useRef<string>("");

  // Cleanup
  useEffect(() => {
    return () => {
      if (crackTimerRef.current) clearTimeout(crackTimerRef.current);
      if (randomCrackLoopRef.current) clearTimeout(randomCrackLoopRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (audioContextRef.current) {
          audioContextRef.current.close();
      }
    };
  }, []);

  const playAudio = async (data: Uint8Array): Promise<{ duration: number, startTime: number }> => {
      if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      if (audioContextRef.current.state === 'suspended') {
          await audioContextRef.current.resume();
      }
      
      // Stop previous audio if any
      if (audioSourceRef.current) {
          try {
              audioSourceRef.current.stop();
          } catch (e) { /* ignore */ }
      }

      const buffer = decodePCM(data, audioContextRef.current);
      const source = audioContextRef.current.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContextRef.current.destination);
      audioSourceRef.current = source;
      
      const startTime = audioContextRef.current.currentTime;
      source.start(startTime);
      return { duration: buffer.duration, startTime };
  };

  const startSyncedTypewriter = (text: string, durationSec: number, audioStartTime?: number) => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      setDisplayedNarrative("");
      setIsTyping(true);

      // Weighted Pacing Logic for Lyric-like Sync
      const weights: number[] = [];
      let totalWeight = 0;
      
      for (let i = 0; i < text.length; i++) {
          const char = text[i];
          let w = 1;
          
          if (char === ' ') w = 2.5;
          else if (/[A-Z]/.test(char)) w = 1.2;
          
          if ([',', ';'].includes(char)) w = 10; 
          else if (['-', '—'].includes(char)) w = 12;
          else if (['.', '!', '?', ':'].includes(char)) {
             if (char === '.' && text[i+1] === '.') w = 3; 
             else w = 20;
          }
          
          totalWeight += w;
          weights.push(totalWeight);
      }

      // If audio is present, we use its exact timing.
      // If no audio (fallback), we simulate a reading speed.
      const useAudioClock = audioStartTime !== undefined && audioContextRef.current !== null;
      const fallbackStartTime = performance.now() / 1000;

      const animate = () => {
          const now = useAudioClock 
            ? audioContextRef.current!.currentTime 
            : performance.now() / 1000;
            
          const start = useAudioClock ? audioStartTime! : fallbackStartTime;
          const elapsed = now - start;
          
          // Target finishing text at 95% of audio duration to handle trailing silence
          const textRevealDuration = durationSec > 0 ? durationSec * 0.95 : 0;
          
          const progress = textRevealDuration > 0 
              ? Math.min(1, Math.max(0, elapsed / textRevealDuration))
              : 1;

          const targetWeight = progress * totalWeight;
          
          let charIndex = weights.findIndex(w => w >= targetWeight);
          
          if (charIndex === -1) {
              if (progress >= 1) charIndex = text.length - 1;
              else charIndex = 0;
          }
          
          setDisplayedNarrative(text.substring(0, charIndex + 1));

          // Continue animation loop until full audio duration completes
          // This keeps cursor active even after text is done
          if (elapsed < durationSec) {
              animationFrameRef.current = requestAnimationFrame(animate);
          } else {
              setDisplayedNarrative(text);
              setIsTyping(false);
          }
      };
      
      animationFrameRef.current = requestAnimationFrame(animate);
  };

  // --- Instability Logic ---
  
  const triggerCrack = (durationBase: number, intensityOverride?: 'low' | 'high') => {
      const duration = durationBase + (Math.random() * 400 - 200);
      let intensity: 'low' | 'high' = 'low';
      if (intensityOverride) {
          intensity = intensityOverride;
      } else {
          intensity = (Math.random() < (instability / 15)) ? 'high' : 'low';
      }

      setCrackState(intensity);
      if (crackTimerRef.current) clearTimeout(crackTimerRef.current);
      crackTimerRef.current = setTimeout(() => {
          setCrackState('none');
      }, duration);
  };

  useEffect(() => {
      if (node?.narrative) {
          const text = node.narrative.toLowerCase();
          const stressWords = ['kill', 'die', 'death', 'blood', 'run', 'panic', 'scream', 'fight', 'terror', 'error', 'glitch', 'corrupt', 'fail'];
          let stressCount = 0;
          stressWords.forEach(w => {
              if (text.includes(w)) stressCount++;
          });
          setInstability(prev => {
              const decay = Math.max(0, prev - 1);
              return Math.min(10, decay + (stressCount * 2));
          });
      }
  }, [node]);

  useEffect(() => {
      const loop = () => {
          const triggerChance = 0.05 + (instability * 0.08);
          if (Math.random() < triggerChance) {
              const duration = 200 + (instability * 100);
              triggerCrack(duration);
          }
          const baseInterval = 10000;
          const interval = Math.max(2000, baseInterval - (instability * 800));
          const jitter = Math.random() * 3000;
          randomCrackLoopRef.current = setTimeout(loop, interval + jitter);
      };

      randomCrackLoopRef.current = setTimeout(loop, 5000);
      return () => {
          if (randomCrackLoopRef.current) clearTimeout(randomCrackLoopRef.current);
      };
  }, [instability]);


  // --- Load Logic ---

  useEffect(() => {
    if (showTimeline && node) {
      storageService.getAncestors(node.id).then(nodes => {
        setTimelineNodes([...nodes, node]);
      });
    }
  }, [showTimeline, node]);


  const loadNode = async (targetNodeId: string | null, userChoiceText: string | null, isBacktrack = false) => {
    const requestId = crypto.randomUUID();
    currentRequestRef.current = requestId;

    setLoading(true);
    setDisplayedNarrative(""); 
    setIsTyping(false);
    setImageUrl(null);
    setImageError(false);
    
    if (audioSourceRef.current) {
        try { audioSourceRef.current.stop(); } catch(e) {}
    }

    try {
       triggerCrack(400, 'low');

       let newNode: StoryNode;
       let audioData: Uint8Array | null = null;

       if (isBacktrack && targetNodeId) {
          const stored = await storageService.getNode(targetNodeId);
          if (!stored) throw new Error("Node lost in time");
          newNode = stored;
          setContext(newNode.narrative); 
          
          if (newNode.audioAssetId) {
              const blob = await storageService.getAssetBlob(newNode.audioAssetId);
              if (blob) {
                  const buffer = await blob.arrayBuffer();
                  audioData = new Uint8Array(buffer);
              }
          }
       } else {
          const currentContext = context + (userChoiceText ? ` User chose: "${userChoiceText}".` : "");
          
          // Text Generation (Blocking for flow logic)
          newNode = await getStoryNode(config.textModel, currentContext, psychProfile, node?.id || null, userChoiceText || undefined);
          setContext(prev => prev + " " + newNode.narrative);
       }

       // Start Image Loading/Generation in Parallel (Non-blocking)
       if (config.visualsEnabled && newNode.visualPrompt) {
           (async () => {
               try {
                   let url: string | null = null;
                   if (newNode.imageAssetId) {
                       url = await storageService.getAssetUrl(newNode.imageAssetId);
                   } else {
                       // If we're backtracking or it's a new node without image yet
                       const result = await generateSceneImage(config.imageModel, newNode.visualPrompt, config.imageSize);
                       if (result) {
                           url = result.url;
                           newNode.imageAssetId = result.assetId;
                           // Save node update with asset ID (async)
                           await storageService.saveNode(newNode);
                       }
                   }
                   
                   // Only update state if this is still the active request
                   if (currentRequestRef.current === requestId) {
                       if (url) setImageUrl(url);
                       else setImageError(true);
                   }
               } catch (e) {
                   console.error("Image load error", e);
                   if (currentRequestRef.current === requestId) setImageError(true);
               }
           })();
       }

       // Audio Generation/Loading (Blocking for sync)
       // We want audio ready before showing text to ensure sync works
       if (config.audioEnabled && !audioData && !isBacktrack) {
           audioData = await generateSpeech(config.ttsModel, newNode.narrative);
           if (audioData) {
               const blob = new Blob([audioData as BlobPart], { type: 'audio/pcm' });
               const assetId = crypto.randomUUID();
               await storageService.saveAsset(assetId, blob, 'audio/pcm');
               newNode.audioAssetId = assetId;
               await storageService.saveNode(newNode);
           }
       }

       // --- Render State ---
       if (currentRequestRef.current !== requestId) return; // Abort if new request started

       setNode(newNode);
       
       let audioMetadata = { duration: 0, startTime: 0 };
       if (audioData && config.audioEnabled) {
           audioMetadata = await playAudio(audioData);
       } else {
           const readingSpeed = 0.05; 
           audioMetadata.duration = Math.max(2.0, newNode.narrative.length * readingSpeed); 
           audioMetadata.startTime = performance.now() / 1000;
       }
       
       startSyncedTypewriter(
           newNode.narrative, 
           audioMetadata.duration, 
           (config.audioEnabled && audioData) ? audioMetadata.startTime : undefined
       );
       
       setLoading(false); 

       if (newNode.gameState === 'won' || newNode.gameState === 'lost') {
          triggerCrack(3000, 'high');
          setGlobalStage(GameStage.ENDING);
          return;
       }

       if (!newNode.autoProgress && newNode.choices.length > 0 && !isBacktrack) {
          newNode.choices.slice(0, 2).forEach(c => {
             prefetchNode(config.textModel, context + " " + newNode.narrative, psychProfile, c.text, newNode.id);
          });
       }

    } catch (e) {
       console.error(e);
       if (currentRequestRef.current === requestId) {
           setGlobalStage(GameStage.ERROR);
           setLoading(false);
       }
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
    <div className={`h-screen w-full flex flex-col bg-[#050505] relative overflow-hidden z-10 ${crackState !== 'none' ? 'grayscale-[20%] contrast-125' : ''}`}>
      <div className={`crack-overlay ${crackState === 'low' ? 'crack-active' : ''} ${crackState === 'high' ? 'crack-active-high' : ''}`}></div>

      <div className="absolute inset-0 z-0 overflow-hidden bg-black">
          {imageUrl ? (
              <div className="w-full h-full relative animate-ken-burns animate-ripple">
                 <img src={imageUrl} alt="Scene" className="w-full h-full object-cover opacity-60 grayscale-[30%] contrast-125" />
                 <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-transparent to-black" />
              </div>
          ) : imageError ? (
               <div className="w-full h-full flex items-center justify-center relative">
                  <div className="scanlines opacity-50" />
                  <div className="text-danger font-mono text-2xl tracking-[0.5em] animate-pulse z-10 glitch-text">
                      NO SIGNAL
                  </div>
               </div>
          ) : (
              <div className="w-full h-full bg-black" />
          )}
      </div>

      <div className="relative z-10 flex flex-col h-full justify-between p-4 md:p-12 overflow-y-auto scrollbar-hide">
         <div className="flex justify-between items-start opacity-50 hover:opacity-100 transition-opacity shrink-0 mb-4">
             <h1 className="text-white font-mono text-xs tracking-widest uppercase">Bandersnatch Interactive</h1>
             <button onClick={() => setShowTimeline(true)} className="text-xs text-white font-mono border border-white/30 px-3 py-1 hover:bg-white hover:text-black transition-colors">
                [ TIMELINE ]
             </button>
         </div>

         <div className="w-full max-w-5xl mx-auto flex flex-col gap-6 md:gap-8 mb-4 md:mb-12 mt-auto">
             <div className="bg-black/60 backdrop-blur-md p-6 md:p-8 border border-white/10 rounded-sm min-h-[120px] md:min-h-[160px] flex flex-col justify-end shadow-2xl">
                 <p className="text-lg md:text-3xl text-white leading-relaxed font-medium drop-shadow-lg font-display">
                     {displayedNarrative}
                     {isTyping && <span className="inline-block w-2 h-6 md:w-3 md:h-8 bg-white align-middle ml-1 animate-blink shadow-[0_0_10px_white]"></span>}
                 </p>
             </div>

             <div className="flex flex-col gap-2">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                     {node?.choices.map((choice, idx) => (
                         <button 
                            key={idx} 
                            onClick={() => handleChoice(choice.text, choice.nextId)}
                            className={`group relative py-4 px-6 md:py-6 md:px-8 bg-white/5 border border-white/20 transition-all duration-200 overflow-hidden ${
                              node.choices.length === 1 ? "col-span-1 md:col-span-2 text-center" : ""
                            } ${
                              isTyping 
                                ? "opacity-50 cursor-wait" 
                                : "hover:bg-white/90 hover:border-white cursor-pointer"
                            }`}
                            disabled={isTyping}
                         >
                             <div className="absolute bottom-0 left-0 h-1 w-full bg-white scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-300"></div>
                             <span className={`text-lg md:text-2xl text-white font-bold tracking-wide font-display uppercase ${!isTyping && "group-hover:text-black"}`}>
                                {node.choices.length === 1 && choice.text === "Continue" ? "[ CONTINUE ]" : choice.text}
                             </span>
                         </button>
                     ))}
                     {node?.choices.length === 0 && !isTyping && (
                       <div className="col-span-1 md:col-span-2 text-center">
                          <p className="text-white/50 font-mono tracking-widest uppercase">TERMINAL STATE REACHED</p>
                       </div>
                     )}
                 </div>
             </div>
         </div>
      </div>

      {showTimeline && (
        <div className="absolute inset-0 z-50 bg-black/95 backdrop-blur-xl overflow-hidden flex flex-col">
            <div className="p-8 flex justify-between items-center border-b border-white/10">
                <h2 className="text-white font-mono text-2xl tracking-widest">NARRATIVE THREAD</h2>
                <button onClick={() => setShowTimeline(false)} className="text-white/50 hover:text-white font-mono">[ CLOSE ]</button>
            </div>
            <div className="flex-1 overflow-x-auto flex items-center p-12 gap-8">
                {timelineNodes.map((n, i) => (
                    <div key={n.id} className="flex items-center shrink-0">
                        <div className="flex flex-col gap-2 w-64 group cursor-pointer" onClick={() => jumpToNode(n.id)}>
                            <div className={`w-full aspect-video border ${n.id === node?.id ? 'border-accent bg-accent/10' : 'border-white/20 bg-white/5 group-hover:border-white'}`}>
                                <div className="w-full h-full flex items-center justify-center text-white/20 text-xs font-mono">
                                    {n.gameState === 'lost' ? 'DEAD END' : 'NODE ' + i}
                                </div>
                            </div>
                            <p className="text-white/70 text-xs font-mono line-clamp-2">{n.narrative}</p>
                        </div>
                        {i < timelineNodes.length - 1 && <div className="w-12 h-px bg-white/20"></div>}
                    </div>
                ))}
            </div>
        </div>
      )}
    </div>
  );
};
