import React, { useState, useRef } from 'react';
import { Button } from './Button';
import { Input } from './Input';
import { AppConfig, PsychProfile, StoryLine } from '../types';
import { getStoryLineData, downloadStoryLine, parseStoryLineFile, restoreStoryLine } from '../services/geminiService';

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

type ModalState = {
    type: 'EXPORT' | 'IMPORT';
    data: StoryLine;
} | null;

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
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [modalData, setModalData] = useState<ModalState>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasValidSession = !!apiKey && !!psychProfile;

  const handleExportClick = async () => {
      setLoadingAction('EXPORTING...');
      try {
          const data = await getStoryLineData();
          setModalData({ type: 'EXPORT', data });
      } catch (e) {
          alert("EXPORT FAILED");
      } finally {
          setLoadingAction(null);
      }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLoadingAction('ANALYZING...');
      try {
        const data = await parseStoryLineFile(file);
        setModalData({ type: 'IMPORT', data });
      } catch (e) {
        alert("FILE CORRUPTED");
      } finally {
        setLoadingAction(null);
      }
    }
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const confirmAction = async () => {
      if (!modalData) return;
      
      if (modalData.type === 'EXPORT') {
          downloadStoryLine(modalData.data);
          setModalData(null);
      } else {
          setLoadingAction('RESTORING...');
          try {
            await restoreStoryLine(modalData.data);
            window.location.reload();
          } catch (e) {
              alert("RESTORE FAILED");
          }
      }
  };

  const formatDate = (ts: number) => new Date(ts).toLocaleDateString() + ' ' + new Date(ts).toLocaleTimeString();

  return (
    <div className="h-screen w-full flex flex-col bg-[#0a0a0a] relative overflow-hidden z-10">
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_transparent_0%,_#000000_120%)] z-0 pointer-events-none" />

      <div className="relative z-20 flex flex-col items-center pt-16 md:pt-24 mb-8">
        <p className="text-white/30 font-mono text-xs tracking-[0.3em] uppercase mb-2">System v2.5 Ready</p>
        <h1 className="text-6xl md:text-8xl font-bold text-white tracking-tighter text-bandersnatch select-none">
          BANDERSNATCH
        </h1>
      </div>

      <div className="relative z-20 flex-1 w-full max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-8 px-8 pb-12">
        <div className="md:col-span-5 flex flex-col justify-center md:justify-end md:pb-24 space-y-2">
          <div className="text-white/20 font-mono text-xs uppercase tracking-widest space-y-3 select-none">
            <p className="flex items-center gap-2"><span className="w-1 h-1 bg-white/20"></span> SYSTEM READY.</p>
            <p className="flex items-center gap-2"><span className="w-1 h-1 bg-white/20"></span> MEMORY LINKED.</p>
          </div>
        </div>

        <div className="md:col-span-7 flex flex-col justify-center md:pl-12 gap-8">
          
          {hasValidSession && (
            <div className="group cursor-pointer" onClick={onResume}>
              <div className="border border-white/10 bg-white/5 p-6 relative overflow-hidden transition-all duration-300 hover:bg-white/10 hover:border-white/20">
                <div className="absolute top-4 bottom-4 left-0 w-1 bg-accent shadow-[0_0_10px_#57e668]"></div>
                <div className="pl-4">
                  <p className="text-accent text-xs font-mono tracking-widest mb-1">SAVE_DATA_FOUND</p>
                  <h2 className="text-2xl text-white font-mono tracking-wider">RESUME SIMULATION</h2>
                  <p className="text-white/40 text-xs mt-2 font-mono">Last Access: {psychProfile ? formatDate(psychProfile.timestamp) : 'UNKNOWN'}</p>
                </div>
              </div>
            </div>
          )}

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
                    <div className="mt-2 text-right">
                      <a 
                        href="https://aistudio.google.com/app/api-keys" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-[10px] font-mono text-accent/70 hover:text-accent hover:underline tracking-widest uppercase"
                      >
                        [ NO KEY? GENERATE ONE HERE ]
                      </a>
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

          <div className="flex justify-center gap-6 mt-8">
             <button onClick={() => setShowSettings(!showSettings)} className="text-[10px] uppercase tracking-[0.2em] text-white/30 hover:text-white/80 transition-colors">[ CONFIGURE ]</button>
             <button onClick={handleSystemReset} className="text-[10px] uppercase tracking-[0.2em] text-white/30 hover:text-danger transition-colors">[ RESET ]</button>
             <button onClick={handleExportClick} className="text-[10px] uppercase tracking-[0.2em] text-white/30 hover:text-accent transition-colors">
               {loadingAction === 'EXPORTING...' ? '[ PROCESSING... ]' : '[ EXPORT DATA ]'}
             </button>
             <button onClick={() => fileInputRef.current?.click()} className="text-[10px] uppercase tracking-[0.2em] text-white/30 hover:text-accent transition-colors">
               {loadingAction === 'ANALYZING...' ? '[ ANALYZING... ]' : '[ IMPORT DATA ]'}
             </button>
             <input type="file" ref={fileInputRef} onChange={handleImportFile} accept=".bndr" className="hidden" />
          </div>
          
        </div>
      </div>

      {/* Config Modal */}
      {showSettings && (
        <div className="absolute inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
           <div className="w-full max-w-md border border-white/20 bg-[#0a0a0a] p-8">
              <h3 className="text-white font-mono text-lg mb-6 tracking-widest border-b border-white/10 pb-4">CONFIGURATION</h3>
              <div className="space-y-6">
                 <div className="space-y-2">
                    <label className="text-xs text-white/50 font-mono uppercase tracking-widest">Graphics</label>
                    <div className="grid grid-cols-3 gap-2">
                       {['1K', '2K', '4K'].map(res => (
                          <button key={res} onClick={() => setConfig({...config, imageSize: res as any})} className={`py-2 border text-xs font-mono ${config.imageSize === res ? 'bg-white text-black border-white' : 'border-white/20 text-white/50'}`}>{res}</button>
                       ))}
                    </div>
                 </div>
                 <Button fullWidth variant="secondary" onClick={() => setShowSettings(false)}>CLOSE</Button>
              </div>
           </div>
        </div>
      )}

      {/* Data Inspector Modal */}
      {modalData && (
         <div className="absolute inset-0 z-50 bg-black/95 flex items-center justify-center p-4">
             <div className="w-full max-w-lg border-2 border-primary bg-black p-8 shadow-[0_0_30px_rgba(0,255,0,0.1)]">
                 <h3 className="text-primary font-mono text-xl mb-6 tracking-widest uppercase border-b border-primary/30 pb-4">
                     {modalData.type === 'EXPORT' ? 'CONFIRM EXPORT' : 'VERIFY DATA IMPORT'}
                 </h3>
                 
                 <div className="space-y-4 font-mono text-sm mb-8">
                     <div className="flex justify-between text-white/70">
                         <span>TIMESTAMP:</span>
                         <span className="text-white">{formatDate(modalData.data.timestamp)}</span>
                     </div>
                     <div className="flex justify-between text-white/70">
                         <span>NODES:</span>
                         <span className="text-white">{modalData.data.nodes.length}</span>
                     </div>
                     <div className="flex justify-between text-white/70">
                         <span>DEATHS:</span>
                         <span className="text-danger">{modalData.data.memory.deathCount}</span>
                     </div>
                     <div className="flex justify-between text-white/70">
                         <span>PROFILE:</span>
                         <span className="text-accent">{modalData.data.profile ? 'DETECTED' : 'NONE'}</span>
                     </div>
                     {modalData.data.profile && (
                        <div className="border border-white/10 p-3 mt-2 bg-white/5">
                             <div className="text-[10px] text-white/40 uppercase mb-1">Traits</div>
                             <div className="text-white">{modalData.data.profile.traits.join(' / ')}</div>
                             <div className="text-[10px] text-white/40 uppercase mt-2 mb-1">Stats</div>
                             <div className="flex gap-4 text-[10px]">
                                 <span>P:{modalData.data.profile.paranoia}</span>
                                 <span>C:{modalData.data.profile.compliance}</span>
                                 <span>A:{modalData.data.profile.aggression}</span>
                             </div>
                        </div>
                     )}
                 </div>

                 <div className="flex gap-4">
                     <Button fullWidth variant="ghost" onClick={() => setModalData(null)}>CANCEL</Button>
                     <Button fullWidth variant="primary" onClick={confirmAction}>
                         {modalData.type === 'EXPORT' ? 'DOWNLOAD' : 'RESTORE'}
                     </Button>
                 </div>
             </div>
         </div>
      )}
    </div>
  );
};
