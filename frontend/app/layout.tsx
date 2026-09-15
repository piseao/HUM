import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "HUM | 나의 첫 멜로디",
  description: "떠오른 멜로디를 진짜 노래로.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
