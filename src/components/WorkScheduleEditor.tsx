import React, { useEffect, useState } from 'react';
import { BellRing, CalendarClock, Check, Clock3, Loader2, Plus, Save, Trash2, X } from 'lucide-react';
import { fetchApi } from '../lib/api';

type SoundName = 'new_order' | 'order_alert' | 'order_delivered' | 'order_confirmed';
interface Slot { id: string; daysOfWeek: number[]; startTime: string; endTime: string; }
interface Schedule {
  enabled: boolean;
  timezone: string;
  slots: Slot[];
  startSound: SoundName;
  endSound: SoundName;
}
const DAYS = [
  { label: 'Sun', value: 0 }, { label: 'Mon', value: 1 }, { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 }, { label: 'Thu', value: 4 }, { label: 'Fri', value: 5 }, { label: 'Sat', value: 6 }
];
const EMPTY: Schedule = { enabled: false, timezone: 'Asia/Kolkata', slots: [], startSound: 'new_order', endSound: 'order_delivered' };

export default function WorkScheduleEditor() {
  const [schedule, setSchedule] = useState<Schedule>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [extending, setExtending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showContinuePrompt, setShowContinuePrompt] = useState(false);

  async function loadSchedule() {
    setLoading(true);
    setError('');
    const result = await fetchApi<{ schedule: Schedule }>('/api/delivery/rider/schedule', { method: 'GET' }, { forceRefresh: true, ttlMs: 0 });
    if (result.success && result.schedule) {
      setSchedule({
        ...EMPTY,
        ...result.schedule,
        slots: (result.schedule.slots || []).map((slot, index) => ({
          ...slot,
          id: slot.id || `slot_${index + 1}`,
          daysOfWeek: Array.isArray(slot.daysOfWeek) ? slot.daysOfWeek : []
        }))
      });
    } else {
      setError(result.error || 'Could not load work schedule. Please retry.');
    }
    setLoading(false);
  }

  useEffect(() => {
    void loadSchedule();
    const params = new URLSearchParams(window.location.search);
    if (params.get('continueWork') === '1') setShowContinuePrompt(true);
  }, []);

  const updateSlot = (id: string, patch: Partial<Slot>) => {
    setSchedule(prev => ({ ...prev, slots: prev.slots.map(slot => slot.id === id ? { ...slot, ...patch } : slot) }));
    setNotice('');
  };

  const addSlot = () => {
    if (schedule.slots.length >= 5) return;
    const id = `slot_${Date.now().toString(36)}`;
    setSchedule(prev => ({ ...prev, slots: [...prev.slots, { id, daysOfWeek: [1, 2, 3, 4, 5], startTime: '12:00', endTime: '21:00' }] }));
    setNotice('');
  };

  const removeSlot = (id: string) => setSchedule(prev => ({ ...prev, slots: prev.slots.filter(slot => slot.id !== id) }));

  const toggleDay = (id: string, day: number) => {
    const slot = schedule.slots.find(item => item.id === id);
    if (!slot) return;
    const daysOfWeek = slot.daysOfWeek.includes(day)
      ? slot.daysOfWeek.filter(value => value !== day)
      : [...slot.daysOfWeek, day].sort((a, b) => a - b);
    updateSlot(id, { daysOfWeek });
  };

  const save = async () => {
    setSaving(true);
    setError('');
    setNotice('');
    const result = await fetchApi<{ schedule: Schedule }>('/api/delivery/rider/schedule', {
      method: 'PUT',
      body: JSON.stringify(schedule)
    });
    if (result.success) {
      if (result.schedule) setSchedule({ ...schedule, ...result.schedule });
      setNotice('Weekly work time saved. Olive Pizza will update your availability automatically.');
      setShowContinuePrompt(false);
      const url = new URL(window.location.href);
      url.searchParams.delete('continueWork');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    } else {
      setError(result.error || 'Could not save your schedule.');
    }
    setSaving(false);
  };

  const continueWork = async (minutes: number) => {
    setExtending(true);
    setError('');
    const result = await fetchApi('/api/delivery/rider/schedule/continue', {
      method: 'POST',
      body: JSON.stringify({ minutes })
    });
    if (result.success) {
      setNotice(`You're back online for another ${minutes} minutes.`);
      setShowContinuePrompt(false);
      const url = new URL(window.location.href);
      url.searchParams.delete('continueWork');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    } else {
      setError(result.error || 'Could not continue work.');
    }
    setExtending(false);
  };

  if (loading) return <div className="rounded-3xl border border-slate-800 bg-[#0F172A] p-6 flex items-center gap-3 text-sm text-slate-300"><Loader2 className="w-4 h-4 animate-spin text-amber-400" /> Loading your work schedule…</div>;

  return (
    <section className="rounded-3xl border border-slate-800 bg-[#0F172A] p-4 sm:p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-start gap-2.5">
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-2 text-amber-400"><CalendarClock className="h-5 w-5" /></div>
          <div>
            <h2 className="text-sm font-extrabold text-white">My weekly work time</h2>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">Create up to five time slots. You can repeat a slot on multiple days or add separate shifts on the same day.</p>
          </div>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-[11px] font-bold text-slate-300">
          <input type="checkbox" checked={schedule.enabled} onChange={e => setSchedule(prev => ({ ...prev, enabled: e.target.checked }))} className="h-4 w-4 accent-amber-500" />
          Enabled
        </label>
      </div>

      {schedule.slots.length === 0 && <div className="rounded-2xl border border-dashed border-slate-700 p-4 text-xs text-slate-400">No work times configured yet. Add a slot to set your weekly availability.</div>}

      {schedule.slots.map((slot, index) => (
        <div key={slot.id} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-white">Work time {index + 1}</span>
            <button type="button" onClick={() => removeSlot(slot.id)} className="flex items-center gap-1 rounded-lg p-1.5 text-[11px] font-bold text-rose-300 hover:bg-rose-500/10" aria-label={`Remove work time ${index + 1}`}><Trash2 className="h-3.5 w-3.5" /> Remove</button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-[11px] font-semibold text-slate-400"><span className="flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" /> Start</span><input type="time" value={slot.startTime} onChange={e => updateSlot(slot.id, { startTime: e.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm font-bold text-white outline-none focus:border-amber-500" /></label>
            <label className="space-y-1 text-[11px] font-semibold text-slate-400"><span className="flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" /> End</span><input type="time" value={slot.endTime} onChange={e => updateSlot(slot.id, { endTime: e.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm font-bold text-white outline-none focus:border-amber-500" /></label>
          </div>
          <div>
            <p className="mb-2 text-[11px] font-semibold text-slate-400">Repeat on</p>
            <div className="grid grid-cols-7 gap-1">
              {DAYS.map(day => (
                <button key={day.value} type="button" onClick={() => toggleDay(slot.id, day.value)} aria-pressed={slot.daysOfWeek.includes(day.value)} className={`rounded-lg px-1 py-2 text-[10px] font-extrabold transition ${slot.daysOfWeek.includes(day.value) ? 'bg-amber-500 text-slate-950' : 'border border-slate-700 bg-slate-900 text-slate-400 hover:text-white'}`}>{day.label}</button>
              ))}
            </div>
          </div>
          {slot.endTime < slot.startTime && <p className="text-[10px] text-amber-300">This slot crosses midnight and ends on the following day.</p>}
        </div>
      ))}

      <button type="button" disabled={schedule.slots.length >= 5} onClick={addSlot} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-700 py-3 text-xs font-bold text-amber-300 hover:border-amber-500/50 disabled:cursor-not-allowed disabled:opacity-40"><Plus className="h-4 w-4" /> Add work time ({schedule.slots.length}/5)</button>

      <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/40 p-3.5">
        <div className="flex items-center gap-2 text-xs font-extrabold text-white"><BellRing className="h-4 w-4 text-amber-400" /> Work-time alert sounds</div>
        <label className="block space-y-1 text-[11px] text-slate-400"><span>When work starts</span><select value={schedule.startSound} onChange={e => setSchedule(prev => ({ ...prev, startSound: e.target.value as SoundName }))} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-xs font-bold text-white"><option value="new_order">New order chime</option><option value="order_alert">Work-start alert</option></select></label>
        <label className="block space-y-1 text-[11px] text-slate-400"><span>When work ends</span><select value={schedule.endSound} onChange={e => setSchedule(prev => ({ ...prev, endSound: e.target.value as SoundName }))} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-xs font-bold text-white"><option value="order_delivered">Work-ended chime</option><option value="order_confirmed">Soft confirmation</option></select></label>
        <p className="text-[10px] leading-relaxed text-slate-500">Background alerts use the phone's notification-volume controls. You can mute or change notification sounds in system Settings.</p>
      </div>

      {error && <div role="alert" className="rounded-xl border border-rose-500/25 bg-rose-500/10 p-3 text-xs text-rose-200">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3 text-xs text-emerald-200">{notice}</div>}

      {showContinuePrompt && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-3">
          <div className="flex items-start gap-2"><Clock3 className="mt-0.5 h-4 w-4 text-amber-300" /><div><h3 className="text-sm font-extrabold text-white">Your work time ended</h3><p className="mt-1 text-xs text-slate-300">You're offline now. Continue for a little longer or finish for today.</p></div></div>
          <div className="grid grid-cols-2 gap-2">
            {[30, 60, 120, 180].map(minutes => <button key={minutes} disabled={extending} type="button" onClick={() => void continueWork(minutes)} className="rounded-xl border border-amber-500/30 bg-slate-950/50 py-2.5 text-xs font-extrabold text-amber-200 hover:bg-amber-500/10 disabled:opacity-50">{minutes < 60 ? `${minutes} minutes` : `${minutes / 60} hour${minutes === 60 ? '' : 's'}`}</button>)}
          </div>
          <button type="button" onClick={() => { setShowContinuePrompt(false); const url = new URL(window.location.href); url.searchParams.delete('continueWork'); window.history.replaceState({}, '', url.pathname + url.search + url.hash); }} className="flex w-full items-center justify-center gap-1 rounded-xl border border-slate-700 py-2.5 text-xs font-bold text-slate-300"><Check className="h-4 w-4" /> Done for today</button>
          {extending && <div className="flex items-center gap-2 text-[11px] text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Updating your availability…</div>}
        </div>
      )}

      <button type="button" onClick={() => void save()} disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-3 text-xs font-black text-slate-950 hover:bg-amber-400 disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{saving ? 'Saving…' : 'Save weekly work time'}</button>
    </section>
  );
}
