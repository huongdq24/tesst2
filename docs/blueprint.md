# **App Name**: iGen - Trợ lý AI Xây dựng thương hiệu cá nhân

## Core Features:

- User Authentication & Authorization: Secure user sign-up and login using Email/Password, Google Auth, or Phone Auth, with role assignment (Admin/User) based on credentials.
- Personal API Key Management (BYOK): A secure, in-app form for users to input and store their personal API keys (Gemini, ElevenLabs, HeyGen) in Firestore, enabling 'Bring-Your-Own-Key' functionality.
- Cloud Credit Onboarding Modal: A visually engaging modal offering users $300 Google Cloud credits upon login, with a button to claim that updates their profile in Firestore.
- AI Creative Dashboard: A responsive 2x2 grid layout displaying access cards for AI-powered features: Voice Cloning, Avatar Cloning, Image Generation, and Video Generation.
- AI Content Generation & Cloning Tool: Provide a split-pane interface allowing users to utilize their stored API keys to generate images, videos, clone voices, and create avatars.
- Content Management & Training Data: Enable file uploads for AI processing, with a 'permanent training' toggle that flags files with a 30-day TTL in Firestore metadata.
- Multi-language Support: A UI toggle to effortlessly switch between Vietnamese (Default), English, and Chinese for core application strings.

## Style Guidelines:

- Primary color: A sophisticated blue-cyan (#26A9D9) that echoes the application's branding and provides a modern, executive feel. This color ensures strong readability on a light background.
- Background color: A very light, desaturated blue-grey (#F3F6F7), subtly related to the primary hue, providing a clean 'executive dashboard' aesthetic akin to Notion or Apple interfaces. This closely matches `bg-slate-50`.
- Accent color: A verdant green (#229E6B), offering a harmonious yet distinct contrast to the primary blue-cyan, perfect for call-to-action elements or highlights.
- Body and headline font: 'Inter' (sans-serif) for its highly legible, objective, and modern appearance, suitable for a professional and intuitive user interface inspired by contemporary tech platforms.
- Utilize icons from 'Lucide React', emphasizing clear, minimal line-art iconography to maintain a clean and modern 'Executive Dashboard' aesthetic.
- The dashboard features a 2x2 grid layout, while feature detail workspaces adopt a professional split-pane UI for optimal content display and interaction.
- Subtle, smooth transitions and hover effects will be applied to glassmorphism cards and modal elements, enhancing the premium feel without distracting from content.