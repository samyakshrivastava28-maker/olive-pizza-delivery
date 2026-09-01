import React, { useState, useEffect } from 'react';
import { 
  Phone, 
  ShieldCheck, 
  X, 
  CheckCircle, 
  AlertCircle, 
  ArrowRight, 
  RefreshCw,
  QrCode
} from 'lucide-react';
import { fetchApi } from '../lib/api';
import { TruecallerService } from '../lib/Truecaller';
import toast from 'react-hot-toast';

interface PhoneVerificationModalProps {
  isOpen: boolean;
  currentPhone: string;
  onClose: () => void;
  onSuccess: (newPhone: string) => void;
}

export const PhoneVerificationModal: React.FC<PhoneVerificationModalProps> = ({
  isOpen,
  currentPhone,
  onClose,
  onSuccess
}) => {
  const [newPhone, setNewPhone] = useState(currentPhone || '');
  const [otp, setOtp] = useState('');
  const [pinId, setPinId] = useState<string | null>(null);
  const [step, setStep] = useState<'input' | 'otp' | 'truecaller_qr'>('input');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [isNative, setIsNative] = useState(false);

  useEffect(() => {
    setIsNative(TruecallerService.isNative());
  }, []);

  useEffect(() => {
    let timer: any;
    if (countdown > 0) {
      timer = setInterval(() => setCountdown(c => c - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [countdown]);

  if (!isOpen) return null;

  const normalizePhone = (num: string) => {
    let cleaned = num.replace(/\D/g, '');
    if (cleaned.length === 10) return `+91${cleaned}`;
    if (cleaned.length === 12 && cleaned.startsWith('91')) return `+${cleaned}`;
    return `+91${cleaned.slice(-10)}`;
  };

  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const formatted = normalizePhone(newPhone);
    if (formatted.length < 13) {
      toast.error('Please enter a valid 10-digit mobile number.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetchApi<{ success: boolean; message?: string; pinId?: string; error?: string }>('/api/phone/send-otp', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber: formatted })
      });

      if (res.success) {
        toast.success(res.message || 'Verification OTP sent to your phone!');
        if (res.pinId) setPinId(res.pinId);
        setStep('otp');
        setCountdown(60);
      } else {
        toast.error(res.error || 'Failed to send OTP.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Network error while sending OTP.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp || otp.length < 4) {
      toast.error('Please enter the 6-digit OTP code.');
      return;
    }

    setLoading(true);
    try {
      const formatted = normalizePhone(newPhone);
      const res = await fetchApi<{ success: boolean; phone?: string; error?: string }>('/api/phone/verify-otp', {
        method: 'POST',
        body: JSON.stringify({
          phoneNumber: formatted,
          otp: otp.trim(),
          pinId
        })
      });

      if (res.success) {
        toast.success('Phone verified successfully! ✓');
        onSuccess(res.phone || formatted);
        onClose();
      } else {
        toast.error(res.error || 'Invalid OTP code.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Verification failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleTruecallerVerify = async () => {
    const formatted = normalizePhone(newPhone);
    setLoading(true);

    try {
      if (isNative) {
        const isSupported = await TruecallerService.isNativeSupported();
        if (!isSupported) {
          toast('Truecaller is not active on this device. Switching to SMS OTP.', { icon: '⚡' });
          await handleSendOtp();
          return;
        }

        const nativeResult = await TruecallerService.verifyNative();
        const verifyRes = await TruecallerService.verifyOnBackend(nativeResult, formatted);

        if (verifyRes.success) {
          toast.success('Phone verified instantly via Truecaller! ✓');
          onSuccess(verifyRes.phone || formatted);
          onClose();
        } else {
          toast.error(verifyRes.error || 'Truecaller verification failed.');
        }
      } else {
        // Web QR Code Session
        const sessionRes = await TruecallerService.createWebSession(formatted);
        const qrApi = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(sessionRes.deepLink)}`;
        setQrUrl(qrApi);
        setStep('truecaller_qr');

        // Start polling for verification confirmation
        const interval = setInterval(async () => {
          try {
            const poll = await TruecallerService.pollWebSession(sessionRes.requestId);
            if (poll.status === 'VERIFIED') {
              clearInterval(interval);
              toast.success('Phone verified via Truecaller QR! ✓');
              onSuccess(poll.phone || formatted);
              onClose();
            } else if (poll.status === 'FAILED' || poll.status === 'CANCELLED') {
              clearInterval(interval);
              toast.error(poll.error || 'Truecaller verification was cancelled.');
              setStep('input');
            }
          } catch {}
        }, 2000);
      }
    } catch (err: any) {
      toast.error(err.message || 'Truecaller verification error.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-sm bg-[#0F172A] border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 relative">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Phone className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Rider Phone Verification</h3>
            <p className="text-[11px] text-slate-400">Secure 2FA OTP & Truecaller Instant Verification</p>
          </div>
        </div>

        {step === 'input' && (
          <form onSubmit={handleSendOtp} className="space-y-3 pt-2">
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">Mobile Phone Number</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 font-mono">+91</span>
                <input
                  type="tel"
                  required
                  maxLength={10}
                  value={newPhone.replace(/^\+91/, '')}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="9876543210"
                  className="w-full pl-12 pr-3 py-2.5 bg-[#090E17] border border-slate-700 rounded-xl text-white font-mono text-sm focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleTruecallerVerify}
              disabled={loading}
              className="w-full py-2.5 px-3 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 text-blue-400" />
              <span>Verify Instantly with Truecaller</span>
            </button>

            <div className="flex items-center gap-2 py-1">
              <div className="flex-1 h-px bg-slate-800" />
              <span className="text-[10px] uppercase font-bold text-slate-500">Or SMS OTP</span>
              <div className="flex-1 h-px bg-slate-800" />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all cursor-pointer disabled:opacity-50"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <span>Send Verification OTP</span>}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={handleVerifyOtp} className="space-y-3 pt-2">
            <div className="text-center space-y-1">
              <span className="text-[11px] text-slate-400">Enter the 6-digit code sent to</span>
              <strong className="block text-xs text-white font-mono">{normalizePhone(newPhone)}</strong>
            </div>

            <div>
              <input
                type="text"
                required
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className="w-full text-center tracking-widest text-lg font-mono py-2.5 bg-[#090E17] border border-slate-700 rounded-xl text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading || otp.length < 4}
              className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all cursor-pointer disabled:opacity-50"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <span>Confirm & Verify Phone</span>}
              <CheckCircle className="w-4 h-4" />
            </button>

            <div className="flex items-center justify-between text-[11px] pt-1">
              <button
                type="button"
                onClick={() => setStep('input')}
                className="text-slate-400 hover:text-white"
              >
                Change Number
              </button>
              {countdown > 0 ? (
                <span className="text-slate-500 font-mono">Resend in {countdown}s</span>
              ) : (
                <button
                  type="button"
                  onClick={() => handleSendOtp()}
                  className="text-amber-400 hover:underline font-semibold"
                >
                  Resend OTP
                </button>
              )}
            </div>
          </form>
        )}

        {step === 'truecaller_qr' && (
          <div className="text-center space-y-3 pt-2">
            <p className="text-xs text-slate-300">
              Scan this QR code with the <strong className="text-blue-400">Truecaller App</strong> or camera on your phone.
            </p>
            {qrUrl && (
              <div className="p-3 bg-white rounded-2xl w-fit mx-auto shadow-xl">
                <img src={qrUrl} alt="Truecaller QR" className="w-48 h-48" />
              </div>
            )}
            <button
              type="button"
              onClick={() => setStep('input')}
              className="text-xs text-slate-400 hover:text-white underline pt-1 block mx-auto"
            >
              Cancel & Use SMS OTP
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
