import React, { useState, useEffect } from 'react';
import { 
  Volume2, 
  VolumeX, 
  Volume1, 
  Bell, 
  CheckCircle2, 
  Vibrate, 
  Sparkles, 
  X, 
  Play, 
  Square,
  RotateCcw,
  Music
} from 'lucide-react';
import { 
  SoundAlertEngine, 
  type SoundSettings, 
  ALERT_SOUND_OPTIONS, 
  DEFAULT_ALERT_SOUND_ID 
} from '../lib/SoundAlertEngine';

interface SoundSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SoundSettingsModal: React.FC<SoundSettingsModalProps> = ({ isOpen, onClose }) => {
  const [settings, setSettings] = useState<SoundSettings>(() => SoundAlertEngine.getSettings());
  const [isPlayingTest, setIsPlayingTest] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const unsub = SoundAlertEngine.subscribeSettings((newSettings) => {
      setSettings(newSettings);
    });
    return unsub;
  }, [isOpen]);

  if (!isOpen) return null;

  const handleUpdate = (partial: Partial<SoundSettings>) => {
    SoundAlertEngine.saveSettings(partial);
    setSettings((prev) => ({ ...prev, ...partial }));
  };

  const handleTestSound = () => {
    SoundAlertEngine.unlockAudio();
    setIsPlayingTest(true);
    SoundAlertEngine.playSound('delivery_urgent');
    setTimeout(() => setIsPlayingTest(false), 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full max-w-md bg-[#0F172A] border border-slate-800 rounded-3xl p-6 shadow-2xl text-slate-100 relative overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rider-sound-settings-title"
      >
        {/* Glow Accent */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Volume2 className="w-5 h-5" />
            </div>
            <div>
              <h3 id="rider-sound-settings-title" className="text-base font-bold text-white tracking-tight">
                Rider Alert Sound Settings
              </h3>
              <p className="text-xs text-slate-400">Delivery dispatch notification & chimes</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            aria-label="Close sound settings"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="py-5 space-y-4">
          {/* Master Volume Slider */}
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white flex items-center gap-1.5">
                {settings.muted ? (
                  <VolumeX className="w-4 h-4 text-rose-400" />
                ) : settings.volume < 0.4 ? (
                  <Volume1 className="w-4 h-4 text-amber-300" />
                ) : (
                  <Volume2 className="w-4 h-4 text-amber-400" />
                )}
                <span>Dispatch Volume</span>
              </span>
              <span className="font-mono text-amber-400 font-bold">
                {settings.muted ? 'MUTED' : `${Math.round(settings.volume * 100)}%`}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="range"
                min="0.05"
                max="1.0"
                step="0.05"
                disabled={settings.muted}
                value={settings.volume}
                onChange={(e) => handleUpdate({ volume: parseFloat(e.target.value) })}
                className="flex-1 h-2 rounded-lg bg-slate-800 accent-amber-500 cursor-pointer disabled:opacity-40"
              />
              <button
                onClick={() => handleUpdate({ muted: !settings.muted })}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 shrink-0 cursor-pointer ${
                  settings.muted 
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' 
                    : 'bg-slate-800 text-slate-300 hover:text-white border border-slate-700'
                }`}
              >
                {settings.muted ? 'Unmute' : 'Mute'}
              </button>
            </div>
          </div>

          {/* Built-in Sound Picker */}
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Music className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">Dispatch Alert Sound</span>
              </div>
              <button
                onClick={() => handleUpdate({ selectedSoundId: DEFAULT_ALERT_SOUND_ID })}
                className="flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 font-semibold transition cursor-pointer"
                title="Reset to default sound"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Default</span>
              </button>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {ALERT_SOUND_OPTIONS.map((opt) => {
                const isSelected = settings.selectedSoundId === opt.id;
                return (
                  <div
                    key={opt.id}
                    onClick={() => handleUpdate({ selectedSoundId: opt.id })}
                    className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-amber-500/15 border-amber-500/60 text-white shadow-xs'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-white'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold truncate text-white">{opt.name}</span>
                        {isSelected && (
                          <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 truncate">{opt.description}</p>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        SoundAlertEngine.previewSoundFile(opt.file);
                      }}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-white border border-slate-700 transition shrink-0 cursor-pointer"
                      title={`Preview ${opt.name}`}
                    >
                      <Play className="w-3 h-3 fill-current" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Vibration Toggle */}
          <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-sky-500/15 border border-sky-500/30 text-sky-400 flex items-center justify-center shrink-0 mt-0.5">
                <Vibrate className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white">Device Haptics & Vibration</h4>
                <p className="text-[11px] text-slate-400 leading-snug">
                  Vibrate rider device upon new delivery assignment
                </p>
              </div>
            </div>
            <button
              onClick={() => handleUpdate({ vibration: !settings.vibration })}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                settings.vibration ? 'bg-amber-500' : 'bg-slate-800'
              }`}
              role="switch"
              aria-checked={settings.vibration}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  settings.vibration ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Test Sound Button */}
          <div className="pt-2 border-t border-slate-800 flex gap-2">
            <button
              onClick={handleTestSound}
              disabled={isPlayingTest}
              className="flex-1 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-white flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-60"
            >
              <Play className={`w-3.5 h-3.5 text-amber-400 ${isPlayingTest ? 'animate-spin' : ''}`} />
              <span>{isPlayingTest ? 'Testing...' : 'Test Dispatch Sound'}</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold transition shadow-md cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
