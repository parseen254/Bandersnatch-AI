import React, { useState } from 'react';
import { Button } from './Button';
import { Input } from './Input';
import { AppConfig, PsychProfile } from '../types';
import { MODELS } from '../constants';
import { clearAllData } from '../services/geminiService';

interface BiosScreenProps {
  apiKey: string;
  setApiKey: (key: string) => void;
  config: AppConfig;
  setConfig: (config: AppConfig) => void;
  psychProfile: PsychProfile | null;
  onInitialize: () => void;
  onResume: () => void;
  handleSystemReset: () => void;
}

export const BiosScreen: React.FC<BiosScreenProps> = ({ 
  apiKey, 
  setApiKey, 
  config, 
  setConfig, 
  psychProfile,
  onInitialize,
  onResume,
  handleSystemReset
}) => {
  const [showSettings, setShowSettings] = useState(false);
  const hasValidSession = !!apiKey && !!psychProfile;

  return (
    <div className="h-screen w-full flex flex-col bg-[#0a0a0a] relative overflow-hidden z-10">
      
      {/* Background Elements matching screenshot */}
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_transparent_0%,_#000000_120%)] z-0 pointer-events-none" />

      {/* Header Content */}
      <div className="relative z-20 flex flex-col items-center pt-16 md:pt-24 mb-8">
        <p className="text-white/30 font-mono text-xs tracking-[0.3em] uppercase mb-2">System v2.5 Ready</p>
        <h1 className="text-6xl md:text-8xl font-bold text-white tracking-tighter text-bandersnatch select-none">
          BANDERSNATCH
        </h1>
      </div>

      {/* Main Split Layout */}
      <div className="relative z-20 flex-1 w-full max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-8 px-8 pb-12">
        
        {/* Left Column: System Status / Decorative */}
        <div className="md:col-span-5 flex flex-col justify-center md:justify-end md:pb-24 space-y-2">
          <div className="text-white/20 font-mono text-xs uppercase tracking-widest space-y-3 select-none">
            <p className="flex items-center gap-2">
              <span className="w-1 h-1 bg-white/20"></span> INITIALIZING NEURAL INTERFACE...
            </p>
            <p className="flex items-center gap-2">
              <span className="w-1 h-1 bg-white/20"></span> CONNECTING TO GEMINI 2.5 KERNEL...
            </p>
            <p className="flex items-center gap-2">
              <span className="w-1 h-1 bg-white/20"></span> LOADING ASSETS...
            </p>
            <p className="flex items-center gap-2">
              <span className="w-1 h-1 bg-white/20"></span> DECRYPTING NARRATIVE ENGRAMS...
            </p>
            <p className="flex items-center gap-2">
              <span className="w-1 h-1 bg-white/20"></span> OPTIMIZING MEMORY SHARDS...
            </p>
            <p className="text-white/50 pt-2"> > SIMULATION READY.</p>
          </div>
        </div>

        {/* Right Column: Interaction Area */}
        <div className="md:col-span-7 flex flex-col justify-center md:pl-12 gap-8">
          
          {/* Resume Card - Always shown if valid session, otherwise disabled/hidden style */}
          {hasValidSession && (
            <div className="group cursor-pointer" onClick={onResume}>
              <div className="border border-white/10 bg-white/5 p-6 relative overflow-hidden transition-all duration-300 hover:bg-white/10 hover:border-white/20">
                {/* Green Accent Line */}
                <div className="absolute top-4 bottom-4 left-0 w-1 bg-accent shadow-[0_0_10px_#57e668]"></div>
                
                <div className="pl-4">
                  <p className="text-accent text-xs font-mono tracking-widest mb-1">SAVE_DATA_FOUND</p>
                  <h2 className="text-2xl text-white font-mono tracking-wider">RESUME SIMULATION</h2>
                  <p className="text-white/40 text-xs mt-2 font-mono">Last Access: {new Date(psychProfile.timestamp).toLocaleDateString()}</p>
                </div>
              </div>
            </div>
          )}

          {/* New Simulation / Initialize Section */}
          <div className="flex flex-col gap-4 mt-4">
             <div className="border border-white/10 bg-black/40 p-6">
                {!hasValidSession && (
                  <div className="mb-6">
                    <Input 
                      label="INITIALIZE WITH API KEY"
                      sublabel="REQUIRED PARAMETER"
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="ENTER GEMINI KEY"
                      className="tracking-widest"
                    />
                  </div>
                )}
                
                {hasValidSession && (
                  <div className="mb-6">
                    <div className="flex justify-between items-center text-white/30 text-xs font-mono uppercase tracking-widest border-b border-white/10 pb-2 mb-4">
                       <span>Start New Timeline</span>
                       <span className="text-white/10">+</span>
                    </div>
                  </div>
                )}

                <Button 
                  fullWidth 
                  variant="primary" 
                  onClick={onInitialize} 
                  disabled={!apiKey && !hasValidSession}
                  className={hasValidSession ? "!bg-transparent !text-white !border !border-white/50 hover:!bg-white hover:!text-black" : ""}
                >
                  {hasValidSession ? "START NEW SIMULATION" : "NEW SIMULATION"}
                </Button>
             </div>
          </div>

          {/* Footer Controls */}
          <div className="flex justify-center gap-6 mt-8">
             <button onClick={() => setShowSettings(!showSettings)} className="text-[10px] uppercase tracking-[0.2em] text-white/30 hover:text-white/80 transition-colors">
                [ CONFIGURE API KEY ]
             </button>
             <button onClick={handleSystemReset} className="text-[10px] uppercase tracking-[0.2em] text-white/30 hover:text-danger transition-colors">
                [ SYSTEM RESET ]
             </button>
          </div>
          
        </div>
      </div>

      {/* Settings Modal Overlay */}
      {showSettings && (
        <div className="absolute inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
           <div className="w-full max-w-md border border-white/20 bg-[#0a0a0a] p-8">
              <h3 className="text-white font-mono text-lg mb-6 tracking-widest border-b border-white/10 pb-4">CONFIGURATION</h3>
              
              <div className="space-y-6">
                 <div className="space-y-2">
                    <label className="text-xs text-white/50 font-mono uppercase tracking-widest">Graphics Quality</label>
                    <div className="grid grid-cols-3 gap-2">
                       {['1K', '2K', '4K'].map(res => (
                          <button
                            key={res}
                            onClick={() => setConfig({...config, imageSize: res as any})}
                            className={`py-2 border text-xs font-mono ${config.imageSize === res ? 'bg-white text-black border-white' : 'border-white/20 text-white/50 hover:border-white/50'}`}
                          >
                            {res}
                          </button>
                       ))}
                    </div>
                 </div>

                 <div className="space-y-2">
                    <label className="text-xs text-white/50 font-mono uppercase tracking-widest">Audio Synthesis</label>
                    <button 
                       onClick={() => setConfig({...config, audioEnabled: !config.audioEnabled})}
                       className={`w-full py-2 border text-xs font-mono flex items-center justify-center gap-2 ${config.audioEnabled ? 'border-accent text-accent bg-accent/10' : 'border-white/20 text-white/50'}`}
                    >
                       <span>{config.audioEnabled ? 'ENABLED' : 'DISABLED'}</span>
                    </button>
                 </div>

                 <div className="pt-4">
                    <Button fullWidth variant="secondary" onClick={() => setShowSettings(false)}>CLOSE</Button>
                 </div>
              </div>
           </div>
        </div>
      )}

    </div>
  );
};