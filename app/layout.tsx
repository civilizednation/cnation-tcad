import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BG Cell Implant Simulator",
  description: "Implant 조건을 입력하고 기준 공정 대비 dose profile, refresh, cell transistor leakage 경향을 비교하는 간이 시뮬레이터입니다.",
  openGraph: {
    title: "BG Cell Implant Simulator",
    description: "Dose Profile · Refresh · Leakage",
    images: [{ url: "/og.png", width: 1731, height: 909, alt: "BG Cell Implant Simulator" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "BG Cell Implant Simulator",
    description: "Dose Profile · Refresh · Leakage",
    images: ["/og.png"],
  },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
