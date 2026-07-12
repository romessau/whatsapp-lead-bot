import "./globals.css";

export const metadata = {
  title: "Real Estate Lead Bot — Demo",
  description: "WhatsApp-style lead qualification bot demo",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-wa-bg min-h-screen flex items-center justify-center">{children}</body>
    </html>
  );
}
