'use client';

import { useEffect, useState } from 'react';
import {
    auth,
    googleProvider,
    signInWithPopup,
    signOut,
    onAuthStateChanged,
    type FirebaseUser,
} from '@/lib/firebase';

export default function AppHeader() {
    const [user, setUser] = useState<FirebaseUser | null>(null);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, (u) => {
            setUser(u);
            setReady(true);
            // Sync Firebase user session into Neon for audit/corridor scoping
            if (u) {
                fetch('/api/firebase/user', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        uid: u.uid,
                        email: u.email,
                        displayName: u.displayName,
                        provider: u.providerData[0]?.providerId ?? 'google.com',
                        metadata: { photoURL: u.photoURL },
                    }),
                }).catch(() => {});
            }
        });
        return unsub;
    }, []);

    const login = async () => {
        try {
            await signInWithPopup(auth, googleProvider);
        } catch (err) {
            console.error('Login failed:', err);
        }
    };

    const logout = async () => {
        try {
            await signOut(auth);
        } catch (err) {
            console.error('Logout failed:', err);
        }
    };

    return (
        <div className="absolute top-5 left-5 right-5 z-10 bg-black/80 px-5 py-4 border-l-4 border-green-500 border-b border-b-green-500/20 flex justify-between items-center">
            <div>
                <div className="font-mono text-2xl font-black tracking-widest text-green-400">
                    PHANTOM POE ENGINE
                </div>
                <div className="text-xs text-gray-400 uppercase tracking-wider mt-1">
                    Corridor Intelligence for Formal &amp; Informal Cross-Border Mobility
                </div>
            </div>

            <div className="flex items-center gap-4">
                <a
                    href="/analytics"
                    className="font-mono text-xs uppercase tracking-widest text-green-400/70 hover:text-green-400 border border-green-400/30 hover:border-green-400 px-3 py-1 transition"
                >
                    Analytics
                </a>
                {!ready ? null : user ? (
                    <div className="flex items-center gap-3 text-green-400 font-mono text-sm">
                        {user.photoURL && (
                            <img src={user.photoURL} alt="Avatar" className="w-8 h-8 rounded-full border border-green-400" />
                        )}
                        <span>{user.displayName}</span>
                        <button onClick={logout} className="border border-green-400 text-green-400 px-3 py-1 text-xs uppercase font-mono hover:bg-green-400 hover:text-black transition">
                            Logout
                        </button>
                    </div>
                ) : (
                    <button onClick={login} className="border border-green-400 text-green-400 px-4 py-1 text-xs uppercase font-mono hover:bg-green-400 hover:text-black transition">
                        Login with Google
                    </button>
                )}
            </div>
        </div>
    );
}
