import type { Metadata } from 'next';
import './globals.css';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { CustomerAuthProvider } from '../lib/auth-context';
import { BRAND } from '../lib/constants';

export const metadata: Metadata = {
  title: {
    default: `${BRAND.NAME} | ${BRAND.TAGLINE}`,
    template: `%s | ${BRAND.NAME}`,
  },
  description: BRAND.DESCRIPTION,
  metadataBase: new URL('http://localhost:3000'),
  openGraph: {
    title: `${BRAND.NAME} | ${BRAND.TAGLINE}`,
    description: BRAND.DESCRIPTION,
    siteName: BRAND.NAME,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: BRAND.NAME,
    description: BRAND.DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className="bg-stone-50 text-slate-900 antialiased font-sans selection:bg-amber-200 selection:text-slate-900">
        <CustomerAuthProvider>
          <div className="min-h-screen flex flex-col">
            <Navbar />
            <main className="flex-1">{children}</main>
            <Footer />
          </div>
        </CustomerAuthProvider>
      </body>
    </html>
  );
}
