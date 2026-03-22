'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

const PhantomMap = dynamic(() => import('@/app/components/PhantomMap'), { ssr: false });

export default function Home() {
    const [CORRIDORS, setCORRIDORS] = useState<any[] | null>(null);
    const [selId, setSelId] = useState<string | null>(null);

    useEffect(() => {
        fetch('/api/corridors/live')
            .then(res => res.json())
            .then((data) => {
                const corridors = data.corridors ?? data;
                setCORRIDORS(corridors);
                if (corridors.length > 0) setSelId(corridors[0].id);
            })
            .catch(console.error);
    }, []);

    if (!CORRIDORS || !selId) {
        return (
            <div style={{ display: 'flex', height: '100vh', width: '100vw', background: '#070A10', alignItems: 'center', justifyContent: 'center', color: '#00E87A', fontFamily: "'IBM Plex Mono', monospace", flexDirection: 'column' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid #00E87A', borderTopColor: 'transparent', animation: 'spin 1s linear infinite', marginBottom: 12 }} />
                <div style={{ fontSize: 10, letterSpacing: 2 }}>BOOTING EXPLAINABILITY ENGINE...</div>
                <div style={{ fontSize: 8, color: '#3A3F5C', marginTop: 8 }}>Synthesizing live corridor traces in Africa</div>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    return <PhantomMap CORRIDORS={CORRIDORS} initialSelId={selId} />;
}
