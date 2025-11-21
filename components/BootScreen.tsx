import React, { useEffect, useState } from 'react';

export const BootScreen: React.FC = () => {
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    const bootSequence = [
      "",
      "TUCKERSOFT SYSTEMS BIOS v2.1",
      "(C) 1984 TUCKERSOFT",
      "--------------------------------",
      "CHECKING MEMORY.........OK",
      "LOADING PERIPHERALS.....OK",
      "INITIALIZING NEURAL NET.OK",
      "--------------------------------",
      "SUBJECT DETECTED.",
      "ANALYZING FEAR RESPONSE...",
      "ACCESS GRANTED."
    ];

    let delay = 0;
    bootSequence.forEach((line, index) => {
      delay += Math.random() * 400 + 100;
      setTimeout(() => {
        setLines(prev => [...prev, line]);
      }, delay);
    });
  }, []);

  return (
    <div className="h-screen w-full flex items-center justify-center bg-transparent z-10 relative">
      <div className="w-full max-w-3xl p-8 font-mono text-xl md:text-2xl leading-relaxed bg-black border-2 border-primary shadow-[0_0_20px_rgba(13,242,13,0.2)]">
        {lines.map((line, i) => (
          <div key={i} className={`mb-1 ${line.includes("SUBJECT") ? "text-white" : "text-primary"} text-glow`}>
            {line}
          </div>
        ))}
        <div className="mt-4 inline-block w-4 h-6 bg-primary animate-blink"></div>
      </div>
    </div>
  );
};