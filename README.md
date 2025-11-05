# Document Management System

A Next.js (App Router) + TypeScript desktop-first application for managing and processing documents with Firebase integration.

## Features

### Pages & Routes
- `/login` - Email-link authentication flow
- `/dashboard` - Document table with company/status filters and traffic-light indicators
- `/upload` - Drag-and-drop file upload to Firebase Storage
- `/document/[id]` - PDF viewer with extracted fields and validation rules
- `/scadenze` - Document expiration tracking with calendar placeholder
- `/repository` - Integration request threads and status tracking

### Components
- **TrafficLight** - Visual status indicator (green/yellow/red)
- **PdfViewer** - PDF embed with fallback message
- **DataTable** - Dense, keyboard-friendly table with loading states
- **UploadBox** - Drag-and-drop file upload with progress tracking

### State & UX
- Desktop-first responsive layout
- Left navigation sidebar
- Loading/skeleton states for all data tables
- Empty states with helpful messages
- Keyboard navigation support

## Prerequisites

- Node.js 18+ and npm
- Firebase project with:
  - Authentication enabled (Email/Password provider with email link sign-in)
  - Cloud Firestore database
  - Cloud Storage bucket

## Environment Variables

Create a `.env.local` file in the root directory with the following variables:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key_here
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

Copy `.env.example` to `.env.local` and fill in your Firebase credentials from the [Firebase Console](https://console.firebase.google.com/).

## Installation

```bash
npm install
```

## Development

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Build

Build the production application:

```bash
npm run build
```

Start the production server:

```bash
npm start
```

## Type Checking

Run TypeScript type checking:

```bash
npm run typecheck
```

## Linting

Run ESLint:

```bash
npm run lint
```

## Project Structure

```
├── app/
│   ├── (app)/               # Authenticated app layout
│   │   ├── dashboard/       # Document dashboard
│   │   ├── document/[id]/   # Document detail view
│   │   ├── upload/          # File upload page
│   │   ├── scadenze/        # Expiration tracking
│   │   ├── repository/      # Integration requests
│   │   └── layout.tsx       # App layout with navigation
│   ├── login/               # Login page
│   ├── layout.tsx           # Root layout
│   └── page.tsx             # Home (redirects to dashboard)
├── components/
│   ├── ui/                  # shadcn/ui components
│   ├── data-table.tsx       # Reusable data table
│   ├── navigation.tsx       # Sidebar navigation
│   ├── pdf-viewer.tsx       # PDF viewer component
│   ├── traffic-light.tsx    # Status indicator
│   └── upload-box.tsx       # File upload component
├── lib/
│   ├── firebaseClient.ts    # Firebase initialization
│   ├── types.ts             # TypeScript types
│   └── utils.ts             # Utility functions
└── .env.local               # Environment variables (create this)
```

## Firebase Setup

### 1. Authentication
- Enable Email/Password provider in Firebase Authentication
- Enable "Email link (passwordless sign-in)" option
- Add authorized domains in Authentication settings

### 2. Storage
- Files are uploaded to: `docs/{tenant}/{company}/tmp/{uuid}.pdf`
- Configure Storage rules as needed

### 3. Firestore (Optional)
- Database structure is ready for future integration
- Currently using mock data for demonstration

## Features Checklist

### Pages
- [x] `/login` - Email-link authentication flow
- [x] `/dashboard` - Document table with filters
- [x] `/upload` - Drag-and-drop file upload
- [x] `/document/[id]` - PDF viewer and details
- [x] `/scadenze` - Expiration tracking
- [x] `/repository` - Integration requests

### Components
- [x] TrafficLight status indicator
- [x] PdfViewer component
- [x] DataTable with keyboard support
- [x] UploadBox with drag-and-drop

### Features
- [x] Desktop-first responsive layout
- [x] Left navigation sidebar
- [x] Loading states
- [x] Empty states
- [x] Firebase client initialization
- [x] Email-link authentication UX
- [x] File upload to Firebase Storage
- [x] Client-side progress tracking

## Development Notes

### Client-Side Only
- All Firebase operations are client-side using the Web SDK
- No server-side rendering for Firebase operations
- All Firebase config uses `NEXT_PUBLIC_*` environment variables

### Mock Data
- Dashboard, document details, scadenze, and repository pages use mock data
- Replace with real Firebase queries when backend is ready

### Out of Scope
- Server actions for OCR/LLM processing
- Admin SDK or secrets management
- Production validation rules (placeholders only)
- Real calendar integration (placeholder shown)

## TypeScript Types

Key types defined in `lib/types.ts`:

- **DocumentItem** - Document metadata with status, dates, and confidence scores
- **RequestItem** - Integration request with status tracking
- **RuleResult** - Validation rule pass/fail results
- **ExtractedField** - OCR extracted fields with confidence

## Accessibility

- Keyboard navigation in tables (Enter/Space to select)
- ARIA labels on status indicators
- Form labels and semantic HTML
- Focus states on interactive elements

## Tech Stack

- **Framework**: Next.js 13.5 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui
- **Icons**: Lucide React
- **Backend**: Firebase (Auth, Firestore, Storage)
- **Form Handling**: React Hook Form + Zod

## License

MIT
