import "./globals.css";

export const metadata = {
  title: "Pakistan Property Assistant",
  description: "AI property search, lead qualification, and agent handoff for Pakistan real estate.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
