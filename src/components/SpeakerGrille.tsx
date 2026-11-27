import React from 'react';

export const SpeakerGrille: React.FC = () => {
  return (
    <div
      data-testid="alc-speaker-grille"
      aria-hidden="true"
      className="h-[18px] w-full rounded border border-[#1a293c] bg-gradient-to-b from-[#0b121c] to-[#060a10] px-1.5 flex items-center justify-between gap-1.5 shadow-[inset_0_1px_3px_rgba(0,0,0,0.85)] pointer-events-none select-none"
      title="Monitor Speaker"
    >
      <span className="text-[7.5px] font-display uppercase tracking-widest text-slate-500 shrink-0 leading-none">
        SPKR
      </span>
      <div className="flex-1 h-[10px] rounded-[2px] border border-[#142030] bg-[#04070c] grid grid-cols-10 grid-rows-2 gap-[2px] p-[2px]">
        {Array.from({ length: 20 }).map((_, idx) => (
          <span
            key={idx}
            className="w-full h-full rounded-full bg-[#131f30] shadow-[inset_0_0.5px_1px_rgba(0,0,0,0.9)]"
          />
        ))}
      </div>
    </div>
  );
};
