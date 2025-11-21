import React, { useState, useEffect, useRef } from 'react';
import { GameStage, PsychProfile, StoryNode, AppConfig } from './types';
import { DEFAULT_CONFIG, MODELS } from './constants';
import { initializeGemini, getStoredProfile, isProfileFresh, clearAllData } from './services/geminiService';
import { Button } from './components/Button';
import { Input } from './components/Input';
import { BootScreen } from './components/BootScreen';
import { BiosScreen } from './components/BiosScreen';
import { PsychEvalScreen } from './components/PsychEvalScreen';
import { StoryScreen } from './components/StoryScreen';

const App: React.FC = () => {
  const [stage, setStage] = useState<GameStage>(GameStage.BOOT);
  
  // Initialize state from storage immediately
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem('BANDERSNATCH_API_KEY') || '');
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [psychProfile, setPsychProfile] = useState<PsychProfile | null>(() => {
    const stored = getStoredProfile();
    return isProfileFresh(stored) ? stored : null;
  });

  const hasCheckedSession = useRef(false);
  
  // Persist API Key
  useEffect(() => {
    if (apiKey) {
      localStorage.setItem('BANDERSNATCH_API_KEY', apiKey);
      initializeGemini(apiKey);
    }
  }, [apiKey]);

  // Boot Sequence (Removed auto-redirect to let BiosScreen handle the choice)
  useEffect(() => {
    if (stage === GameStage.BOOT && !hasCheckedSession.current) {
      hasCheckedSession.current = true;
      
      const timer = setTimeout(() => {
        setStage(GameStage.BIOS);
      }, 4500); // 4.5s boot animation
      return () => clearTimeout(timer);
    }
  }, [stage]);

  // Handlers
  const handleStartNewEval = () => {
    if (!apiKey) {
      alert("API KEY REQUIRED");
      return;
    }
    setStage(GameStage.PSYCH_EVAL);
  };

  const handleResumeSession = () => {
    if (!apiKey || !psychProfile) return;
    console.log("Resuming session...");
    setStage(GameStage.LOADING_SCENE);
  };

  const handleProfileComplete = (profile: PsychProfile) => {
    setPsychProfile(profile);
    setStage(GameStage.LOADING_SCENE);
  };

  const handleFullReset = () => {
    clearAllData();
    setApiKey('');
    setPsychProfile(null);
    setConfig(DEFAULT_CONFIG);
    setStage(GameStage.BOOT);
    hasCheckedSession.current = false; // Reset boot check to allow animation to play again
  };

  const renderStage = () => {
    switch (stage) {
      case GameStage.BOOT:
        return <BootScreen />;
      case GameStage.BIOS:
        return (
          <BiosScreen 
            apiKey={apiKey} 
            setApiKey={setApiKey} 
            config={config} 
            setConfig={setConfig} 
            psychProfile={psychProfile}
            onInitialize={handleStartNewEval}
            onResume={handleResumeSession}
            handleSystemReset={handleFullReset}
          />
        );
      case GameStage.PSYCH_EVAL:
        return (
          <PsychEvalScreen 
            config={config}
            onComplete={handleProfileComplete}
          />
        );
      case GameStage.LOADING_SCENE:
      case GameStage.PLAYING:
        return (
          <StoryScreen 
            config={config}
            psychProfile={psychProfile}
            initialStage={stage}
            setGlobalStage={setStage}
          />
        );
      case GameStage.ENDING:
        return (
          <div className="flex flex-col items-center justify-center h-screen text-center p-8 relative z-20">
             <div className="bg-black border-2 border-primary p-8 shadow-[0_0_30px_rgba(13,242,13,0.3)]">
               <h1 className="text-4xl text-primary mb-4 text-glow">CONNECTION LOST</h1>
               <p className="text-primary/70 mb-8 font-mono">The simulation has ended.</p>
               <Button onClick={() => setStage(GameStage.BIOS)}>REBOOT SYSTEM</Button>
             </div>
          </div>
        );
      case GameStage.ERROR:
        return (
          <div className="flex flex-col items-center justify-center h-screen text-center p-8 bg-red-900/10 relative z-20">
             <h1 className="text-4xl text-danger mb-4 text-glow-red font-mono">CRITICAL KERNEL PANIC</h1>
             <p className="text-danger/70 mb-8 font-mono tracking-widest">ERR_791_MEM_UNSTABLE</p>
             <Button variant="danger" onClick={() => window.location.reload()}>HARD RESET</Button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      <div className="scanlines" />
      <div className="crt-overlay" />
      {renderStage()}
    </div>
  );
};

export default App;