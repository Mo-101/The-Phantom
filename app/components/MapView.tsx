'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Loader } from '@googlemaps/js-api-loader';

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

const hasValidKey =
    Boolean(MAPS_KEY) &&
    MAPS_KEY !== '' &&
    MAPS_KEY !== 'YOUR_API_KEY';

/**
 * Load Google Maps, tolerating HMR / key-change scenarios.
 * The @googlemaps/js-api-loader Loader is a singleton that throws if
 * instantiated twice with different options. We work around this by:
 *   1. Reusing an already-loaded `window.google.maps` if present.
 *   2. Creating the Loader only once.
 *   3. Swallowing the "different options" error and falling back.
 */
let _loaderPromise: Promise<void> | null = null;

async function ensureGoogleMaps(): Promise<void> {
    // Already loaded in a prior session / HMR cycle — nothing to do.
    if ((window as any).google?.maps) return;

    if (!_loaderPromise) {
        const loader = new Loader({
            apiKey: MAPS_KEY,
            version: 'beta',
            libraries: ['geocoding', 'routes', 'geometry'],
        });
        _loaderPromise = loader.load().then(() => undefined);
    }
    return _loaderPromise;
}

export default function MapView() {
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<any>(null);
    const [ready, setReady] = useState(false);
    const [error, setError] = useState('');

    // Lib references
    const Map3DRef = useRef<any>(null);
    const Marker3DRef = useRef<any>(null);
    const Polyline3DRef = useRef<any>(null);
    const geocoderRef = useRef<any>(null);

    const initMap = useCallback(async () => {
        if (!hasValidKey) {
            setError('Google Maps API Key is missing. Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in .env.local');
            return;
        }

        try {
            await ensureGoogleMaps();
            const maps3d = await (window as any).google.maps.importLibrary('maps3d');
            Map3DRef.current = maps3d.Map3DElement;
            Marker3DRef.current = maps3d.Marker3DElement;
            Polyline3DRef.current = maps3d.Polyline3DElement;
            geocoderRef.current = new (window as any).google.maps.Geocoder();

            if (mapRef.current) {
                // The <gmp-map-3d> element is already in the DOM from render
                const mapEl = mapRef.current.querySelector('gmp-map-3d');
                if (mapEl) {
                    mapInstanceRef.current = mapEl;
                }
            }
            setReady(true);
            setError('');
        } catch (err) {
            console.error('Failed to load Google Maps:', err);
            setError('Could not load Google Maps. Check API key and console.');
        }
    }, []);

    useEffect(() => {
        initMap();
    }, [initMap]);

    // Expose map control functions to parent via window (MCP tools use this)
    useEffect(() => {
        if (!ready) return;

        (window as any).__phantomMap = {
            flyTo: (lat: number, lng: number, range = 2000) => {
                const map = mapInstanceRef.current;
                if (!map) return;
                map.flyCameraTo({
                    endCamera: {
                        center: { lat, lng, altitude: 0 },
                        heading: 0,
                        tilt: 67.5,
                        range,
                    },
                    durationMillis: 1500,
                });
            },
            addMarker: (lat: number, lng: number, label: string) => {
                const map = mapInstanceRef.current;
                const Marker3D = Marker3DRef.current;
                if (!map || !Marker3D) return;
                const marker = new Marker3D();
                marker.position = { lat, lng, altitude: 0 };
                marker.label = label.length > 30 ? label.substring(0, 27) + '...' : label;
                marker.gmpClickable = true;
                map.appendChild(marker);
                return marker;
            },
            geocode: async (address: string) => {
                const geocoder = geocoderRef.current;
                if (!geocoder) return null;
                return new Promise<{ lat: number; lng: number } | null>((resolve) => {
                    geocoder.geocode({ address }, (results: any, status: string) => {
                        if (status === 'OK' && results?.[0]) {
                            const loc = results[0].geometry.location;
                            resolve({ lat: loc.lat(), lng: loc.lng() });
                        } else {
                            resolve(null);
                        }
                    });
                });
            },
        };

        return () => {
            delete (window as any).__phantomMap;
        };
    }, [ready]);

    if (!hasValidKey) {
        return (
            <div className="flex items-center justify-center h-full bg-black text-white">
                <div className="text-center max-w-lg p-8 bg-gray-900 rounded-xl border border-gray-800">
                    <h2 className="text-xl font-bold mb-4 text-cyan-400">Google Maps API Key Required</h2>
                    <p className="text-gray-400 mb-4">
                        Set <code className="text-green-400">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> in your <code className="text-green-400">.env.local</code> file.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div ref={mapRef} className="w-full h-full relative bg-black">
            {error && (
                <div className="absolute inset-0 flex items-center justify-center z-50 bg-black/70">
                    <div className="text-red-400 text-center p-8 bg-gray-900 rounded-xl border border-red-800 max-w-md">
                        <p>{error}</p>
                    </div>
                </div>
            )}

            {!ready && !error && (
                <div className="absolute inset-0 flex items-center justify-center z-50">
                    <div className="text-center">
                        <div className="animate-spin h-8 w-8 border-2 border-green-400 border-t-transparent rounded-full mx-auto mb-4" />
                        <p className="text-gray-400 font-mono text-sm">Initializing Photorealistic 3D Map…</p>
                    </div>
                </div>
            )}

            {/* Google Maps 3D Map Element */}
            {/* @ts-expect-error gmp-map-3d is a custom element */}
            <gmp-map-3d
                id="mapContainer"
                style={{ height: '100%', width: '100%' }}
                mode="hybrid"
                center="0,0,100"
                heading="0"
                tilt="45"
                range="20000000"
                default-ui-disabled="true"
            />

            {/* Grid overlay */}
            <div className="map-grid-overlay" />
        </div>
    );
}
