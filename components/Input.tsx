import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  sublabel?: string;
}

export const Input: React.FC<InputProps> = ({ label, sublabel, className = '', ...props }) => {
  return (
    <div className="flex flex-col w-full">
      {label && <label className="text-white/70 text-xs font-mono tracking-widest uppercase mb-1">{label}</label>}
      {sublabel && <span className="text-white/30 text-[10px] font-mono uppercase mb-2">{sublabel}</span>}
      <div className="relative group">
        <input 
          className={`w-full bg-black/50 border-b border-white/20 text-white p-3 font-mono focus:border-white outline-none placeholder-white/20 transition-colors ${className}`}
          {...props}
        />
        <div className="absolute bottom-0 left-0 w-0 h-px bg-white transition-all duration-300 group-focus-within:w-full"></div>
      </div>
    </div>
  );
};