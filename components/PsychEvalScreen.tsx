import React, { useState, useEffect, useRef } from 'react';
import { AppConfig, ChatMessage, PsychProfile } from '../types';
import { generateDirectorResponse, generatePsychProfile } from '../services/geminiService';
import { Button } from './Button';

interface PsychEvalProps {
  config: AppConfig;
  onComplete: (profile: PsychProfile) => void;
}

export const PsychEvalScreen: React.FC<PsychEvalProps> = ({ config, onComplete }) => {
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [turns, setTurns] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const startEval = async () => {
      setIsProcessing(true);
      try {
        const response = await generateDirectorResponse(config.chatModel, [], "Begin the evaluation. Introduce yourself briefly and ask the first question.");
        setHistory([{ role: 'model', text: response.text, systemLog: response.systemLog }]);
      } catch (e) {
        console.error(e);
        setHistory([{ role: 'model', text: "Connection unstable. State your name." }]);
      } finally {
        setIsProcessing(false);
      }
    };
    startEval();
  }, [config.chatModel]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isProcessing) return;

    const userMsg: ChatMessage = { role: 'user', text: input };
    const newHistory = [...history, userMsg];
    setHistory(newHistory);
    setInput('');
    setIsProcessing(true);
    const nextTurn = turns + 1;
    setTurns(nextTurn);

    try {
      if (nextTurn >= 4) {
        const finalText = "Processing complete. Generating psych profile...";
        const finalMsg: ChatMessage = { role: 'model', text: finalText, isTyping: true };
        setHistory([...newHistory, finalMsg]);
        
        const conversation = newHistory.map(m => `${m.role.toUpperCase()}: ${m.text}`).join('\n');
        const profile = await generatePsychProfile(config.chatModel, conversation);
        
        onComplete(profile);
      } else {
        const apiHistory = newHistory.map(h => ({
            role: h.role,
            parts: [{ text: h.text }]
        }));

        const response = await generateDirectorResponse(config.chatModel, apiHistory, userMsg.text);
        setHistory([...newHistory, { role: 'model', text: response.text, systemLog: response.systemLog }]);
      }
    } catch (error) {
      console.error(error);
      setHistory([...newHistory, { role: 'system', text: "ERROR: Signal Lost. Retrying..." }]);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="h-screen w-full flex flex-col bg-[#0a0a0a]">
      <header className="p-4 md:p-6 flex justify-between items-center border-b border-white/5">
        <h2 className="text-white font-mono text-xs tracking-[0.2em] uppercase">Psych_Eval // DIRECTOR</h2>
        {isProcessing && <span className="text-white/50 text-[10px] font-mono uppercase tracking-widest animate-pulse">Processing</span>}
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-12 space-y-6 md:space-y-8 scrollbar-hide" ref={scrollRef}>
        {history.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] md:max-w-[60%] ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
              <p className="text-[10px] text-white/30 mb-2 font-mono uppercase tracking-widest flex items-center gap-2">
                {msg.role === 'model' ? 'THE DIRECTOR' : 'SUBJECT'}
                {msg.systemLog && (
                  <span className="text-accent/50 text-[8px] border border-accent/20 px-1 py-0.5 rounded-sm animate-pulse">
                    [{msg.systemLog}]
                  </span>
                )}
              </p>
              <p className={`text-lg md:text-xl leading-relaxed ${msg.role === 'user' ? 'text-white font-medium' : 'text-white/80 font-light'}`}>
                {msg.text}
              </p>
            </div>
          </div>
        ))}
        {isProcessing && !history[history.length-1]?.isTyping && (
           <div className="flex justify-start">
             <div className="text-left">
               <p className="text-[10px] text-white/30 mb-2 font-mono uppercase tracking-widest">THE DIRECTOR</p>
               <div className="flex gap-1">
                 <span className="w-1 h-1 bg-white rounded-full animate-bounce"></span>
                 <span className="w-1 h-1 bg-white rounded-full animate-bounce delay-100"></span>
                 <span className="w-1 h-1 bg-white rounded-full animate-bounce delay-200"></span>
               </div>
             </div>
           </div>
        )}
      </div>

      <div className="p-4 md:p-12 border-t border-white/5">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto relative">
          <input 
            className="w-full bg-transparent text-white font-mono text-lg md:text-2xl outline-none placeholder-white/20 border-b border-white/20 py-4 focus:border-white transition-colors"
            placeholder={isProcessing ? "..." : "Type your response..."}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            autoFocus
            disabled={isProcessing}
          />
          <div className="absolute right-0 bottom-6">
            <button 
              type="submit" 
              disabled={isProcessing || !input.trim()} 
              className="text-xs font-mono uppercase tracking-widest text-white/50 hover:text-white disabled:opacity-0 transition-all"
            >
              [ SUBMIT ]
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};