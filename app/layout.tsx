import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
    title: '🜂🜄🜁🜃 Phantom POE Engine — MoStar Industries',
    description: 'Corridor Intelligence System — WHO Africa Region',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" className="dark" suppressHydrationWarning>
            <head>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=IBM+Plex+Mono:wght@400;500;600&family=Google+Sans+Text&display=swap" />
                {/* CesiumJS — loaded from CDN to avoid webpack/ESM bundling issues */}
                <link rel="stylesheet" href="https://cesium.com/downloads/cesiumjs/releases/1.124/Build/Cesium/Widgets/widgets.css" />
                {/* eslint-disable-next-line @next/next/no-sync-scripts */}
                <script src="https://cesium.com/downloads/cesiumjs/releases/1.124/Build/Cesium/Cesium.js" />
            </head>
            <body>{children}</body>
        </html>
    );
}
