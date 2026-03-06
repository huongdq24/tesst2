import { AuthForm } from '@/components/auth/auth-form';

export default function AuthPage() {
  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-gradient-to-br from-gray-100 to-blue-100 p-4">
       <div className="absolute inset-0 bg-background bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(38,169,217,0.1),rgba(255,255,255,0))]"></div>
      <AuthForm />
    </main>
  );
}
