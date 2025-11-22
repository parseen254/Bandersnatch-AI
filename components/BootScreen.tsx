
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
    const timeouts: ReturnType<typeof setTimeout>[] = [];

    bootSequence.forEach((line, index) => {
      delay += Math.random() * 400 + 100;
      const t = setTimeout(() => {
        setLines(prev => [...prev, line]);
      }, delay);
      timeouts.push(t);
    });

    // Cleanup function to prevent state updates if component unmounts
    return () => {
      timeouts.forEach(clearTimeout);
    };
  }, []);

  return (
    <div className="h-screen w-full flex items-center justify-center bg-transparent z-10 relative p-4">
      <div className="w-full max-w-3xl p-4 md:p-8 font-mono text-sm md:text-2xl leading-relaxed bg-black border-2 border-primary shadow-[0_0_20px_rgba(13,242,13,0.2)] overflow-hidden">
        {lines.map((line, i) => (
          <div key={i} className={`mb-1 break-words ${line.includes("SUBJECT") ? "text-white" : "text-primary"} text-glow`}>
            {line}
          </div>
        ))}
        <div className="mt-4 inline-block w-3 h-5 md:w-4 md:h-6 bg-primary animate-blink"></div>
      </div>
    </div>
  );
};
