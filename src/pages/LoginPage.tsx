import React, { useState } from 'react';
import { signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, signInWithCredential, signOut, sendEmailVerification } from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { auth } from '../lib/firebase';
import { getApiUrl } from '../lib/api';
import { useDeliveryStore } from '../store/deliveryStore';
import { useNavigate } from 'react-router-dom';
import { Lock, Mail, Truck, ShieldCheck, AlertTriangle } from 'lucide-react';
import { AppLogo } from '../components/common/AppLogo';
import toast from 'react-hot-toast';
import { requestPostLoginNotificationPermissions } from '../services/notificationPermissionService';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [unverifiedEmailUser, setUnverifiedEmailUser] = useState<any>(null);
  const [resendingEmail, setResendingEmail] = useState(false);
  const navigate = useNavigate();

  const formatAuthError = (err: any) => {
    const code = err?.code || '';
    switch (code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'Invalid email or password. Please check your credentials.';
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/user-disabled':
        return 'This rider account has been disabled. Please contact management.';
      case 'auth/too-many-requests':
        return 'Too many failed login attempts. Please try again in a few minutes.';
      case 'auth/network-request-failed':
        return 'Network connection error. Please check your internet connection.';
      case 'auth/popup-closed-by-user':
        return '';
      default:
        return err?.message || 'Login failed. Please try again.';
    }
  };

  const handleResendVerification = async () => {
    if (!unverifiedEmailUser) return;
    setResendingEmail(true);
    try {
      await sendEmailVerification(unverifiedEmailUser);
      toast.success('Verification email resent! Please check your inbox.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to resend verification email.');
    } finally {
      setResendingEmail(false);
    }
  };

  const verifyAndAuthorizeRider = async (firebaseUser: any): Promise<boolean> => {
    const userEmail = (firebaseUser.email || '').toLowerCase().trim();

    // 1. Mandatory Email Verification Gate
    if (!firebaseUser.emailVerified) {
      setUnverifiedEmailUser(firebaseUser);
      await signOut(auth).catch(() => {});
      toast.error('Please verify your email before logging in as a Delivery Partner.');
      return false;
    }

    let isAuthorized = false;
    let denialReason = 'Your account is not registered as an authorized Olive Pizza delivery partner.';

    try {
      const idToken = await firebaseUser.getIdToken();
      const resp = await fetch(getApiUrl('api/auth/authorize-app'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          targetApp: 'DELIVERY'
        })
      });

      const authData = await resp.json().catch(() => null);

      if (resp.ok && authData?.authorized) {
        isAuthorized = true;
      } else {
        denialReason = authData?.reason || denialReason;
      }
    } catch (netErr) {
      console.warn('[LoginPage] Authorization API check notice:', netErr);
    }

    if (!isAuthorized) {
      await signOut(auth).catch(() => {});
      localStorage.removeItem('delivery_rider_profile');
      sessionStorage.clear();
      useDeliveryStore.setState({
        user: null,
        riderProfile: null,
        userRole: null,
        isAuthorized: false,
        restrictedReason: denialReason,
        restrictedEmail: userEmail,
        activeOrders: []
      });
      return false;
    }

    return true;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setUnverifiedEmailUser(null);

    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const isAllowed = await verifyAndAuthorizeRider(cred.user);

      if (!isAllowed) {
        toast.error('Access denied. This app is for Olive Pizza Delivery Partners only.');
        navigate('/access-denied');
        setLoading(false);
        return;
      }

      toast.success('Welcome back, Delivery Partner!');
      requestPostLoginNotificationPermissions().catch(() => {});
      navigate('/dashboard');
    } catch (err: any) {
      const msg = formatAuthError(err);
      if (msg) toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      let result;
      if (Capacitor.isNativePlatform()) {
        const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
        const nativeResult = await FirebaseAuthentication.signInWithGoogle();
        if (nativeResult.credential?.idToken) {
          const credential = GoogleAuthProvider.credential(nativeResult.credential.idToken);
          result = await signInWithCredential(auth, credential);
        } else {
          throw new Error('Google Sign-In failed on device.');
        }
      } else {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        result = await signInWithPopup(auth, provider);
      }
      const isAllowed = await verifyAndAuthorizeRider(result.user);

      if (!isAllowed) {
        toast.error('Access denied. Your Google account is not registered as a delivery partner.');
        navigate('/access-denied');
        setGoogleLoading(false);
        return;
      }

      toast.success('Signed in with Google successfully!');
      requestPostLoginNotificationPermissions().catch(() => {});
      navigate('/dashboard');
    } catch (err: any) {
      console.warn('Google sign in error:', err);
      const msg = formatAuthError(err);
      if (msg) toast.error(msg);
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#090E17] flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-3xl bg-[#0F172A] border border-slate-800 p-6 shadow-2xl space-y-5">
        {/* Header */}
        <div className="flex flex-col items-center text-center space-y-2">
          <AppLogo variant="full" size="xl" subtitle="Delivery Partner Fleet" />
          <p className="text-xs text-slate-400 pt-1">Sign in to your rider partner console</p>
        </div>

        {/* Continue with Google Button */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={googleLoading || loading}
          className="w-full py-3 rounded-2xl bg-white hover:bg-slate-100 text-slate-900 font-extrabold text-xs flex items-center justify-center gap-2.5 shadow-md shadow-white/5 transition-all disabled:opacity-50 cursor-pointer"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>{googleLoading ? 'Signing in with Google...' : 'Continue with Google'}</span>
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-slate-800" />
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">or email</span>
          <div className="flex-1 h-px bg-slate-800" />
        </div>

        {/* Unverified Email Alert */}
        {unverifiedEmailUser && (
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs space-y-2">
            <div className="flex items-start gap-2 text-amber-300">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <strong className="font-bold block">Email Verification Required</strong>
                <span className="text-[11px] text-slate-300">
                  Please verify your email ({unverifiedEmailUser.email}) to activate rider dispatch access.
                </span>
              </div>
            </div>
            <button
              type="button"
              disabled={resendingEmail}
              onClick={handleResendVerification}
              className="w-full py-2 bg-amber-500 hover:bg-amber-600 text-black rounded-xl font-bold text-[11px] transition disabled:opacity-50"
            >
              {resendingEmail ? 'Resending...' : 'Resend Verification Email'}
            </button>
          </div>
        )}

        {/* Email & Password Form */}
        <form onSubmit={handleLogin} className="space-y-3.5 text-xs">
          <div className="space-y-1">
            <label className="font-bold text-slate-300 block">Rider Email</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                placeholder="rider@olivepizza.in"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-[#090E17] border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="font-bold text-slate-300 block">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-[#090E17] border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || googleLoading}
            className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-black font-black text-xs uppercase tracking-wide shadow-lg shadow-amber-500/20 disabled:opacity-50 transition-all cursor-pointer"
          >
            {loading ? 'Authenticating...' : 'Sign In as Rider'}
          </button>
        </form>

        {/* Security badge */}
        <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-slate-400 flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>
            Accounts are provisioned by your assigned Olive Pizza restaurant manager or owner.
          </span>
        </div>
      </div>
    </div>
  );
}