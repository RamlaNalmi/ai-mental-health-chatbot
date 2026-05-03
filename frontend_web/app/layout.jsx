import './globals.css'

export const metadata = {
  title: 'Mira — Student Wellbeing',
  description: 'AI wellbeing companion for undergraduate students',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#0D0F14] text-[#F0EEF9] antialiased min-h-screen" suppressHydrationWarning={true}>
        {children}
      </body>
    </html>
  )
}
