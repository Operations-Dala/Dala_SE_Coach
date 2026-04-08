import './globals.css';
import Sidebar from '@/app/components/Sidebar';

export const metadata = {
  title: 'SE Coach',
  description: 'Daily Sales Executive Performance & Coaching',
  icons: {
    icon: '/icon.png?v=20260408',
    shortcut: '/icon.png?v=20260408',
    apple: '/icon.png?v=20260408',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-100 text-slate-900 antialiased flex">
        <Sidebar />
        <main className="flex-1 min-h-screen bg-white overflow-auto">
          <div className="px-6 py-8">
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}
