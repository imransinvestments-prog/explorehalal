import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

import { getSiteUrl } from '@/lib/site-url'

const siteUrl = getSiteUrl()

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default:
      'Explore Halal — Find HMC & HFA Certified Halal Restaurants Near You',
    template: '%s | Explore Halal',
  },
  description:
    'Explore Halal helps you find certified halal restaurants, takeaways, and eateries near you. Search HMC and HFA certified halal food by location, distance, and cuisine — from halal burgers, grills, and steakhouses to curry, kebabs, fried chicken, pizza, and desserts.',
  applicationName: 'Explore Halal',
  authors: [{ name: 'Explore Halal' }],
  category: 'food',
  keywords: [
    'halal',
    'halal food',
    'halal restaurants',
    'halal restaurants near me',
    'halal dining',
    'halal eateries',
    'halal takeaway',
    'halal takeaways near me',
    'halal food near me',
    'HMC certified',
    'HFA certified',
    'halal certified restaurants',
    'zabihah',
    'muslim friendly restaurants',
    'halal burgers',
    'halal grill',
    'halal steakhouse',
    'halal chicken',
    'halal curry',
    'halal kebab',
    'halal pizza',
    'halal breakfast',
    'halal desserts',
    'halal fine dining',
    'halal street food',
    'best halal restaurants',
    'where to eat halal',
    'halal food finder',
    'halal restaurant map',
  ],
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    siteName: 'Explore Halal',
    url: siteUrl,
    title: 'Explore Halal — Find HMC & HFA Certified Halal Restaurants Near You',
    description:
      'Discover certified halal restaurants, takeaways, and eateries near you. Search HMC and HFA certified halal food by location, distance, and cuisine.',
    locale: 'en_GB',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Explore Halal — Certified Halal Restaurants Near You',
    description:
      'Find HMC and HFA certified halal restaurants, takeaways, and dining spots by location, distance, and cuisine.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#111a15',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`dark bg-background ${inter.variable}`}
    >
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="anonymous" />
        <link
          href="https://api.fontshare.com/v2/css?f[]=clash-display@500,600,700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
