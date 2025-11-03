// app/layout.tsx
import "./global.css";
import { Inter, JetBrains_Mono } from 'next/font/google';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });
const jet = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata = { title: 'Cardano FROST multisig', description: 't-of-n signing UI, this multisig can act like a regular address without having an actor holding the seed' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jet.variable}`}>
      <body className="font-sans bg-gradient-to-br from-zinc-50 via-white to-sky-50 min-h-screen">
        {/* Subtle pattern overlay */}
        <div className="pointer-events-none fixed inset-0 opacity-[0.06] [background-image:radial-gradient(circle_at_1px_1px,#000_1px,transparent_0)] [background-size:16px_16px]" />
        {children}
      </body>
    </html>
  );
}
