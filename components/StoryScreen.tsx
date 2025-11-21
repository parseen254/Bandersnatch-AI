import React, { useState, useEffect, useRef } from 'react';
import { AppConfig, PsychProfile, StoryNode, GameStage } from '../types';
import { generateStoryNode, generateSceneImage, generateSpeech, updateMetaMemory, decodePCM } from '../services/geminiService';
import { Button } from './Button';

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
  const [audioQueue, setAudioQueue] = useState<AudioBuffer[]>([]);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const ambientDroneRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    if (!audioContextRef.current) {
      const AudioCtor = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new AudioCtor({ sampleRate: 24000 });
    }
    return () => {
      stopAmbientDrone();
      audioContextRef.current?.close();
    };
  }, []);

  const playAmbientDrone = () => {
    if (!audioContextRef.current || ambientDroneRef.current) return;
    const ctx = audioContextRef.current;
    
    const osc1 = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    osc1.type = 'sawtooth';
    osc1.frequency.value = 50; 
    
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 100;

    gainNode.gain.value = 0.05;

    osc1.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc1.start();

    ambientDroneRef.current = {
        stop: () => {
            try {
              osc1.stop();
              osc1.disconnect();
              gainNode.disconnect();
            } catch(e) {}
            ambientDroneRef.current = null;
        }
    };
  };

  const stopAmbientDrone = () => {
    if (ambientDroneRef.current) {
        ambientDroneRef.current.stop();
    }
  };

  // Audio State
  useEffect(() => {
    if (loading) {
      stopAmbientDrone();
    } else {
      if (config.audioEnabled) {
        playAmbientDrone();
      }
    }
  }, [loading, config.audioEnabled]);

  // Queue Player
  const isPlayingAudioRef = useRef(false);
  useEffect(() => {
    const processQueue = async () => {
       if (isPlayingAudioRef.current || audioQueue.length === 0 || loading || !audioContextRef.current) return;

       isPlayingAudioRef.current = true;
       const buffer = audioQueue[0];
       const ctx = audioContextRef.current;
       
       if (ctx.state === 'suspended') await ctx.resume();

       const source = ctx.createBufferSource();
       source.buffer = buffer;
       source.connect(ctx.destination);
       
       source.onended = () => {
           isPlayingAudioRef.current = false;
           setAudioQueue(prev => prev.slice(1));
       };

       source.start(0);
    };
    processQueue();
  }, [audioQueue, loading]);

  // Typewriter
  useEffect(() => {
    if (node?.narrative) {
      setDisplayedNarrative("");
      let i = 0;
      const speed = 20;
      const interval = setInterval(() => {
        setDisplayedNarrative(node.narrative.substring(0, i + 1));
        i++;
        if (i >= node.narrative.length) clearInterval(interval);
      }, speed);
      return () => clearInterval(interval);
    }
  }, [node]);

  const loadNextNode = async (userChoiceText?: string) => {
    if (audioContextRef.current?.state === 'suspended') {
      await audioContextRef.current.resume();
    }

    setLoading(true);
    setNode(null);
    setAudioQueue([]); 
    
    try {
        let currentContext = context;
        if (userChoiceText) {
            currentContext += ` User chose: "${userChoiceText}".`;
        }
        
        const newNode = await generateStoryNode(config.textModel, currentContext, psychProfile);
        setNode(newNode);
        setContext(prev => prev + " " + newNode.narrative);
        
        if (newNode.gameState === 'won' || newNode.gameState === 'lost') {
             setGlobalStage(GameStage.ENDING);
             return;
        }
        
        const mediaPromises = [];

        if (config.visualsEnabled && newNode.visualPrompt) {
            mediaPromises.push(
                generateSceneImage(config.imageModel, newNode.visualPrompt, config.imageSize)
                    .then(url => setImageUrl(url))
            );
        }

        if (config.audioEnabled && newNode.narrative) {
            mediaPromises.push(
                generateSpeech(config.ttsModel, newNode.narrative)
                    .then(rawBytes => {
                        if (rawBytes && audioContextRef.current) {
                            const buffer = decodePCM(rawBytes, audioContextRef.current);
                            setAudioQueue(prev => [...prev, buffer]);
                        }
                    })
            );
        }

        await Promise.all(mediaPromises);

    } catch (error) {
        console.error("Story Error:", error);
        setGlobalStage(GameStage.ERROR);
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => {
    if (initialStage === GameStage.LOADING_SCENE) {
        loadNextNode();
        setGlobalStage(GameStage.PLAYING);
    }
  }, []);

  const handleChoice = (choiceText: string, nextId: string) => {
      if (nextId === 'ending') {
          updateMetaMemory({ endingsReached: [choiceText] });
          setGlobalStage(GameStage.ENDING);
      } else {
          loadNextNode(choiceText);
      }
  };

  if (loading) {
      return (
          <div className="h-screen w-full flex flex-col items-center justify-center bg-[#050505] relative overflow-hidden z-20">
              <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-t-transparent border-white rounded-full animate-spin"></div>
                <p className="text-white/50 font-mono text-sm tracking-widest animate-pulse">PROCESSING SIMULATION</p>
              </div>
          </div>
      );
  }

  return (
    <div className="h-screen w-full flex flex-col bg-[#050505] relative overflow-hidden z-10">
      {/* Visual Layer */}
      <div className="absolute inset-0 z-0 transition-opacity duration-1000">
          {imageUrl ? (
              <div className="w-full h-full relative">
                 <img src={imageUrl} alt="Scene" className="w-full h-full object-cover opacity-60 grayscale-[30%] contrast-125" />
                 <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-transparent to-black" />
              </div>
          ) : (
              <div className="w-full h-full bg-[#111]" />
          )}
      </div>

      {/* UI Layer - Netflix Style Interactive */}
      <div className="relative z-10 flex flex-col h-full justify-between p-6 md:p-12">
         <div className="flex justify-between items-start opacity-50 hover:opacity-100 transition-opacity">
             <h1 className="text-white font-mono text-xs tracking-widest uppercase">Bandersnatch Interactive</h1>
             <div className="flex gap-4 text-xs text-white font-mono">
                {/* Status Indicators */}
                <span>P: {psychProfile?.paranoia}%</span>
                <span>C: {psychProfile?.compliance}%</span>
             </div>
         </div>

         <div className="w-full max-w-5xl mx-auto flex flex-col gap-8 mb-12">
             {/* Subtitles / Narrative */}
             <div className="bg-black/60 backdrop-blur-md p-8 border border-white/10 rounded-sm">
                 <p className="text-2xl md:text-3xl text-white leading-relaxed font-medium drop-shadow-lg font-display">
                     {displayedNarrative}
                 </p>
             </div>

             {/* Choice Buttons */}
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                 {node?.choices.map((choice, idx) => (
                     <button 
                        key={idx} 
                        onClick={() => handleChoice(choice.text, choice.nextId)}
                        className="group relative py-6 px-8 bg-white/5 hover:bg-white/90 border border-white/20 hover:border-white transition-all duration-200 overflow-hidden"
                        disabled={displayedNarrative.length < (node?.narrative.length || 0)}
                     >
                         <div className="absolute bottom-0 left-0 h-1 w-full bg-white scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-300"></div>
                         <span className="text-xl md:text-2xl text-white group-hover:text-black font-bold tracking-wide font-display uppercase">
                           {choice.text}
                         </span>
                     </button>
                 ))}
             </div>
         </div>
      </div>
    </div>
  );
};