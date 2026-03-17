import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'WCAG 2.1 AA Accessibility Analyzer — Powered by NVIDIA Nemotron',
  description: 'AI-powered WCAG 2.1 AA compliance analysis. Find and fix accessibility violations before they become lawsuits.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#0a0a0a]">{children}</body>
    </html>
  )
}
