'use client';

import { useAuth } from '@/components/AuthProvider';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, Loader2, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function AuthPage() {
    const { supabase } = useAuth();
    const router = useRouter();

    const [isLogin, setIsLogin] = useState(true);
    const [isLoading, setIsLoading] = useState(false);

    // Form states
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    const toggleMode = () => {
        setIsLogin(!isLogin);
        setErrorMsg('');
        setSuccessMsg('');
    };

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setErrorMsg('');
        setSuccessMsg('');

        try {
            if (isLogin) {
                const { error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) throw error;
                router.push('/dashboard');
            } else {
                const { error } = await supabase.auth.signUp({ email, password });
                if (error) throw error;
                setSuccessMsg('Registration successful! Please check your email for the verification link.');
            }
        } catch (error: any) {
            setErrorMsg(error.message || 'An error occurred.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">

            <div className="mb-8 text-center">
                <Link href="/" className="inline-flex items-center gap-2 mb-4">
                    <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-xl">M</div>
                    <span className="text-2xl font-bold text-gray-900 tracking-tight">MercSync</span>
                </Link>
                <h2 className="text-gray-500 font-medium">
                    {isLogin ? 'Welcome back to your account' : 'Create a new account'}
                </h2>
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-gray-100 ring-1 ring-gray-900/5">
                <div className="flex gap-4 mb-8 bg-gray-100 p-1 rounded-xl">
                    <button
                        onClick={() => { setIsLogin(true); setErrorMsg(''); setSuccessMsg(''); }}
                        className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${isLogin ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Sign In
                    </button>
                    <button
                        onClick={() => { setIsLogin(false); setErrorMsg(''); setSuccessMsg(''); }}
                        className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${!isLogin ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Register
                    </button>
                </div>

                <form onSubmit={handleAuth} className="space-y-5">
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Email Address</label>
                        <input
                            type="email"
                            required
                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none text-gray-900 placeholder-gray-400"
                            placeholder="name@company.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </div>
                    <div>
                        <div className="flex justify-between items-center mb-1.5">
                            <label className="block text-sm font-semibold text-gray-700">Password</label>
                            {isLogin && (
                                <a href="#" className="text-xs font-medium text-blue-600 hover:text-blue-700">Forgot Password?</a>
                            )}
                        </div>
                        <input
                            type="password"
                            required
                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none text-gray-900 placeholder-gray-400"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>

                    {errorMsg && (
                        <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm flex items-start gap-2">
                            <AlertCircle className="w-5 h-5 shrink-0" />
                            <span>{errorMsg}</span>
                        </div>
                    )}

                    {successMsg && (
                        <div className="p-3 rounded-lg bg-green-50 text-green-700 text-sm flex items-start gap-2">
                            <CheckCircle2 className="w-5 h-5 shrink-0" />
                            <span>{successMsg}</span>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 active:bg-blue-800 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {isLoading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <>
                                {isLogin ? 'Sign In' : 'Create Account'}
                                <ArrowRight className="w-4 h-4" />
                            </>
                        )}
                    </button>
                </form>
            </div>

            <p className="mt-8 text-center text-sm text-gray-500">
                &copy; {new Date().getFullYear()} MercSync. Compatible with all major platforms.
            </p>
        </div>
    );
}
