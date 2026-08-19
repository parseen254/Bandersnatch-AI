
import React, { useState, useRef } from 'react';
import { Button } from './Button';
import { Input } from './Input';
import { AppConfig, PsychProfile, StoryLine, UserSession } from '../types';
import { getStoryLineData, downloadStoryLine, parseStoryLineFile, restoreStoryLine } from '../services/geminiService';

interface BiosScreenProps {
  apiKey: string;
  setApiKey: (key: string) => void;
  config: AppConfig;
  setConfig: (config: AppConfig) => void;
  psychProfile: PsychProfile | null;
  user: UserSession | null;
  onInitialize: () => void;
  onResume: () => void;
  onSignOut: () => void;
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
  user,
  onInitialize,
  onResume,
  onSignOut,
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
      {/* 3D Grid Background */}
      <div className="retro-grid-container">
        <div className="retro-grid"></div>
      </div>
      
      {/* Vignette to fade edges */}
      <div className="absolute inset-0 bg-[radial-gradient(circle,transparent_20%,#000000_95%)] pointer-events-none z-0"></div>

      {/* Operator identity chip */}
      {user && (
        <div className="absolute top-4 right-4 z-30 flex items-center gap-3 border border-white/10 bg-black/80 backdrop-blur-sm px-3 py-2">
          {user.picture ? (
            <img src={user.picture} alt="" className="w-6 h-6 rounded-full border border-white/20" referrerPolicy="no-referrer" />
          ) : (
            <span className="w-6 h-6 rounded-full border border-white/20 flex items-center justify-center text-[10px] font-mono text-white/50">?</span>
          )}
          <div className="text-left">
            <p className="text-white/80 font-mono text-[10px] tracking-widest uppercase leading-tight">{user.name}</p>
            <p className="text-white/30 font-mono text-[9px] leading-tight">
              {user.provider === 'google' ? user.email ?? 'GOOGLE ID' : 'GUEST ACCESS'}
            </p>
          </div>
          <button
            onClick={onSignOut}
            className="ml-2 text-[9px] font-mono uppercase tracking-widest text-white/40 hover:text-danger transition-colors"
          >
            [ SIGN OUT ]
          </button>
        </div>
      )}

      <div className="relative z-20 flex flex-col items-center pt-12 md:pt-24 mb-4 md:mb-8 px-4 text-center">
        <p className="text-white/30 font-mono text-[10px] md:text-xs tracking-[0.3em] uppercase mb-2">System v2.5 Ready</p>
        <h1 className="text-4xl sm:text-6xl md:text-8xl font-bold text-white tracking-tighter text-bandersnatch select-none break-all md:break-normal">
          BANDERSNATCH
        </h1>
      </div>

      <div className="relative z-20 flex-1 w-full max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-8 px-4 md:px-8 pb-8 md:pb-12 overflow-y-auto scrollbar-hide">
        <div className="md:col-span-5 flex flex-col justify-center md:justify-end md:pb-24 space-y-2 order-2 md:order-1">
          <div className="text-white/20 font-mono text-[10px] md:text-xs uppercase tracking-widest space-y-3 select-none hidden md:block">
            <p className="flex items-center gap-2"><span className="w-1 h-1 bg-white/20"></span> SYSTEM READY.</p>
            <p className="flex items-center gap-2"><span className="w-1 h-1 bg-white/20"></span> MEMORY LINKED.</p>
            {user && (
              <p className="flex items-center gap-2 text-accent/50">
                <span className="w-1 h-1 bg-accent/50"></span> OPERATOR: {user.name.toUpperCase()}
              </p>
            )}
          </div>
        </div>

        <div className="md:col-span-7 flex flex-col justify-center md:pl-12 gap-6 md:gap-8 order-1 md:order-2">
          
          {hasValidSession && (
            <div className="group cursor-pointer" onClick={onResume}>
              <div className="border border-white/10 bg-black/80 backdrop-blur-sm p-4 md:p-6 relative overflow-hidden transition-all duration-300 hover:bg-white/10 hover:border-white/20">
                <div className="absolute top-4 bottom-4 left-0 w-1 bg-accent shadow-[0_0_10px_#57e668]"></div>
                <div className="pl-4">
                  <p className="text-accent text-[10px] md:text-xs font-mono tracking-widest mb-1">SAVE_DATA_FOUND</p>
                  <h2 className="text-xl md:text-2xl text-white font-mono tracking-wider">RESUME SIMULATION</h2>
                  <p className="text-white/40 text-[10px] md:text-xs mt-2 font-mono">Last Access: {psychProfile ? formatDate(psychProfile.timestamp) : 'UNKNOWN'}</p>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-4 mt-2 md:mt-4">
             <div className="border border-white/10 bg-black/80 backdrop-blur-sm p-4 md:p-6">
                {!hasValidSession && (
                  <div className="mb-6">
                    <Input 
                      label="INITIALIZE WITH API KEY"
                      sublabel="REQUIRED PARAMETER"
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="ENTER GEMINI KEY"
                      className="tracking-widest text-sm md:text-base"
                    />
                    <div className="mt-4 text-center md:text-right">
                      <a 
                        href="https://aistudio.google.com/app/api-keys" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-block p-2 md:p-0 text-[10px] font-mono text-accent/70 hover:text-accent hover:underline tracking-widest uppercase"
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

          <div className="grid grid-cols-2 md:flex md:justify-center gap-4 md:gap-6 mt-4 md:mt-8">
             <button onClick={() => setShowSettings(!showSettings)} className="p-3 md:p-0 border border-white/10 md:border-none text-[10px] uppercase tracking-[0.2em] text-white/50 hover:text-white transition-colors">[ CONFIGURE ]</button>
             <button onClick={handleSystemReset} className="p-3 md:p-0 border border-white/10 md:border-none text-[10px] uppercase tracking-[0.2em] text-white/50 hover:text-danger transition-colors">[ RESET ]</button>
             <button onClick={handleExportClick} className="p-3 md:p-0 border border-white/10 md:border-none text-[10px] uppercase tracking-[0.2em] text-white/50 hover:text-accent transition-colors">
               {loadingAction === 'EXPORTING...' ? '[ PROCESSING... ]' : '[ EXPORT DATA ]'}
             </button>
             <button onClick={() => fileInputRef.current?.click()} className="p-3 md:p-0 border border-white/10 md:border-none text-[10px] uppercase tracking-[0.2em] text-white/50 hover:text-accent transition-colors">
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
                     
                     {modalData.type === 'IMPORT' && (
                         <div className="mt-4 p-3 border border-danger/30 bg-danger/5 text-danger text-xs">
                             WARNING: IMPORTING THIS FILE WILL OVERWRITE CURRENT SESSION DATA.
                         </div>
                     )}
                 </div>

                 <div className="flex gap-4">
                     <Button fullWidth variant="ghost" onClick={() => setModalData(null)}>CANCEL</Button>
                     <Button fullWidth variant="primary" onClick={confirmAction}>
                         {modalData.type === 'EXPORT' ? 'DOWNLOAD' : 'CONFIRM RESTORE'}
                     </Button>
                 </div>
             </div>
         </div>
      )}
    </div>
  );
};