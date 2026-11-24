import React from 'react';
import { BookOpen, CheckCircle2, Circle, X } from 'lucide-react';

interface BeginnerGuideModalProps {
  open: boolean;
  checklist: {
    tunedBand: boolean;
    rotatedAntenna: boolean;
    checkedPropagation: boolean;
    transmittedOrCw: boolean;
    loggedQso: boolean;
  };
  onClose: () => void;
}

export const BeginnerGuideModal: React.FC<BeginnerGuideModalProps> = ({
  open,
  checklist,
  onClose,
}) => {
  if (!open) return null;

  const steps = [
    {
      done: checklist.tunedBand,
      title: '1. Explore Bands & Tune a Signal',
      desc: 'Click a band on the left (like 20m or 40m) or click a peak on the Spectrum Scope. Notice how HF convention uses LSB below 10 MHz and USB above 10 MHz.',
    },
    {
      done: checklist.rotatedAntenna,
      title: '2. Aim the Virtual Antenna Rotor',
      desc: 'Select the 5 Element Yagi and click the Rotor Compass. Pointing the beam toward a distant station boosts the S-Meter and signal clarity.',
    },
    {
      done: checklist.checkedPropagation,
      title: '3. Experiment with Ionospheric Propagation',
      desc: 'Open the Propagation Studio (SFI / K-Index) and try Solar Max vs Aurora Storm. Watch how 10m and 15m open and close with the MUF.',
    },
    {
      done: checklist.transmittedOrCw,
      title: '4. Call CQ using PTT or CW Keyer',
      desc: 'Enable your microphone and hold PTT (or Spacebar) to talk over VOIP, or click CQ in the Keyer to send Morse code.',
    },
    {
      done: checklist.loggedQso,
      title: '5. Log Your First Contact',
      desc: 'Click QSO Log in the bottom-right, record the station callsign and RST signal report (e.g., 59 for voice, 599 for CW).',
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="guide-modal-title"
    >
      <div className="sdr-panel rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-[#1d2c3f] pb-3">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-emerald-400" aria-hidden="true" />
            <div>
              <h2 id="guide-modal-title" className="font-display text-lg font-bold text-white">
                Beginner&apos;s Guide to Amateur Radio (QRP SDR)
              </h2>
              <p className="text-xs text-slate-400">
                Learn real ham radio operating skills safely on virtual VOIP airwaves.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded border border-[#24364d] text-slate-300 hover:text-white cursor-pointer"
            aria-label="Close Beginner Guide"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Practice Checklist */}
        <div className="sdr-bezel rounded-md p-3.5 flex flex-col gap-2.5">
          <h3 className="text-xs font-display font-semibold uppercase tracking-wider text-emerald-300">
            First Operator Practice Checklist
          </h3>
          <div className="flex flex-col gap-2">
            {steps.map((s) => (
              <div key={s.title} className="flex items-start gap-2.5">
                {s.done ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
                ) : (
                  <Circle className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" aria-hidden="true" />
                )}
                <div>
                  <div className={`text-xs font-semibold ${s.done ? 'text-emerald-300' : 'text-slate-100'}`}>
                    {s.title}
                  </div>
                  <div className="text-[11px] text-slate-400">{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Essential Ham Radio Reference */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="sdr-bezel rounded-md p-3 flex flex-col gap-1.5">
            <h4 className="font-display font-semibold text-sky-300 uppercase tracking-wider">
              How to Call CQ (Voice & CW)
            </h4>
            <p className="text-slate-300 leading-relaxed">
              Calling <strong>CQ</strong> means &ldquo;seeking any station.&rdquo; Say:
              <br />
              <span className="font-mono-tabular text-sky-200 block my-1">
                &ldquo;CQ CQ CQ, this is Zulu Sierra One Quebec Romeo Papa, calling CQ and standing by.&rdquo;
              </span>
              Always listen first (&ldquo;Is this frequency in use?&rdquo;) before transmitting.
            </p>
          </div>

          <div className="sdr-bezel rounded-md p-3 flex flex-col gap-1.5">
            <h4 className="font-display font-semibold text-sky-300 uppercase tracking-wider">
              Meters & Controls Explained
            </h4>
            <ul className="text-slate-300 space-y-1">
              <li><strong>S-Meter (S1–S9+60):</strong> Received signal strength. S9 is strong; S3 is weak.</li>
              <li><strong>SWR (Standing Wave Ratio):</strong> Antenna match. Aim for &lt; 1.5; click <strong>TUNE</strong> to match!</li>
              <li><strong>Filter Width:</strong> Narrows receiver passband (2.4 kHz for voice, 0.5 kHz for Morse CW).</li>
              <li><strong>QRP (5W):</strong> Low-power operating — proving global reach takes skill, not brute watts.</li>
            </ul>
          </div>

          <div className="sdr-bezel rounded-md p-3 flex flex-col gap-1.5">
            <h4 className="font-display font-semibold text-sky-300 uppercase tracking-wider">
              RST Signal Reporting
            </h4>
            <ul className="text-slate-300 space-y-1">
              <li><strong>R (Readability 1–5):</strong> 5 = perfectly readable.</li>
              <li><strong>S (Strength 1–9):</strong> Matches the S-Meter needle.</li>
              <li><strong>T (Tone 1–9, CW only):</strong> 9 = pure crisp musical note.</li>
              <li>Example: <strong>59</strong> for clear loud voice; <strong>579</strong> for clear moderate Morse.</li>
            </ul>
          </div>

          <div className="sdr-bezel rounded-md p-3 flex flex-col gap-1.5">
            <h4 className="font-display font-semibold text-sky-300 uppercase tracking-wider">
              Common Q-Codes & Phonetics
            </h4>
            <ul className="text-slate-300 space-y-1">
              <li><strong>QTH:</strong> Station location / Grid square (e.g. KG43).</li>
              <li><strong>QSO:</strong> Two-way contact · <strong>QSL:</strong> Confirmed receipt.</li>
              <li><strong>QRM / QRN:</strong> Station interference / Natural static.</li>
              <li><strong>73:</strong> Best regards · <strong>QRZ?:</strong> Who is calling me?</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
