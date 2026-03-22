import re

with open('app/components/PhantomMap.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

pattern_corridors = re.compile(r'const CORRIDORS: Corridor\[\] = \[\s*\{.*?\n\];\s*const RUN_ID = \'RUN-20260314-X7Q2\';', re.DOTALL)
text = pattern_corridors.sub("const RUN_ID = 'RUN-20260314-X7Q2';", text)

new_state = '''export default function PhantomMap() {
    const mapDivRef = useRef<HTMLDivElement>(null);
    const viewerRef = useRef<CesiumType.Viewer | null>(null);
    const entityIdsRef = useRef<string[]>([]);
    const [cesiumReady, setCesiumReady] = useState(false);
    
    // NEW: Live Data State
    const [CORRIDORS, setCORRIDORS] = useState<Corridor[] | null>(null);
    
    const [selId, setSelId] = useState<string | null>(null);
    const [tab, setTab] = useState<'evidence' | 'cascade' | 'scores' | 'brief'>('evidence');
    const [currentDay, setCurrentDay] = useState(6);
    const [playing, setPlaying] = useState(false);
    const [clock, setClock] = useState('');
    const [showSidebar, setShowSidebar] = useState(true);

    // Fetch live corridors from engine
    useEffect(() => {
        fetch('/api/corridors/live')
            .then(res => res.json())
            .then((data) => {
                setCORRIDORS(data);
                if (data.length > 0) setSelId(data[0].id);
            })
            .catch(console.error);
    }, []);

    // Show loading state if data has not arrived yet
    if (!CORRIDORS || !selId) {
        return (
            <div style={{ display: 'flex', height: '100vh', width: '100vw', background: '#070A10', alignItems: 'center', justifyContent: 'center', color: '#00E87A', fontFamily: "'IBM Plex Mono', monospace", flexDirection: 'column' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid #00E87A', borderTopColor: 'transparent', animation: 'spin 1s linear infinite', marginBottom: 12 }} />
                <div style={{ fontSize: 10, letterSpacing: 2 }}>BOOTING EXPLAINABILITY ENGINE...</div>
                <div style={{ fontSize: 8, color: '#3A3F5C', marginTop: 8 }}>Synthesizing live corridor traces in Africa</div>
                <style>{@keyframes spin { to { transform: rotate(360deg); } }}</style>
            </div>
        );
    }

    const corridor = CORRIDORS.find(c => c.id === selId) ?? CORRIDORS[0]!;
    const rc = RISK[corridor.riskClass] ?? T.muted;
    const maxDay = Math.max(...corridor.evidence.map(e => e.day)) + 1;'''

pattern_comp = re.compile(r'export default function PhantomMap\(\) \{\s*const mapDivRef[^\}]+?const maxDay = Math.max\(\.\.\.corridor\.evidence\.map\(e => e\.day\)\) \+ 1;', re.DOTALL)

text = pattern_comp.sub(new_state, text)

with open('app/components/PhantomMap.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

print("Replacement done.")