# Firebase Studio

This is a Next.js starter project for Firebase Studio, pre-configured with Genkit for AI features.

## Getting Started

### 1. Running the Web Application

To start the Next.js development server for the web application, run the following command:

```bash
npm run dev
```

This will start the main application on `http://localhost:3000`.

### 2. Running the Genkit Developer UI

Genkit comes with a local developer UI that allows you to inspect your AI flows, view traces, and test them interactively. To start the Genkit UI, run the following command in a **separate terminal**:

```bash
npm run genkit:watch
```

This will start the Genkit UI, typically on `http://localhost:4000`. You can use this UI to see how your AI flows are executed in real-time as you use the web application.

### Project Structure

-   `src/app/`: Contains the Next.js pages and components for the web application.
-   `src/ai/`: Contains all Genkit-related code.
    -   `src/ai/flows/`: Defines the individual AI flows (e.g., image generation, video scripting).
    -   `src/ai/genkit.ts`: Configures the global Genkit instance and plugins.
    -   `src/ai/dev.ts`: The entry point for the local Genkit developer UI.
-   `docs/`: Contains backend configuration and schema definitions.
-   `firebase.json`: Configuration for Firebase services like Firestore and Storage rules.
