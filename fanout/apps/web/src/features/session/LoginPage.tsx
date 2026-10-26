import { useNavigate, useSearch } from '@tanstack/react-router';
import { Send } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { Field, TextInput } from '../../components/ui/field.tsx';
import { useSignIn } from './sessionQueries.ts';

export function LoginPage() {
  const { next } = useSearch({ from: '/login' });
  const navigate = useNavigate();
  const signIn = useSignIn();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    await signIn.mutateAsync({ email, password });
    if (next?.startsWith('/admin')) window.location.assign(next);
    else await navigate({ to: next ?? '/' });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-sm p-8">
        <div className="mb-6 flex items-center gap-2 text-xl font-semibold">
          <Send className="size-6" aria-hidden /> Fanout
        </div>
        <h1 className="mb-1 text-lg font-semibold">Log in</h1>
        <p className="mb-6 text-sm text-muted-foreground">Post one video everywhere.</p>
        <form onSubmit={(event) => void submit(event).catch(() => undefined)} className="space-y-4">
          <Field label="Email">
            <TextInput type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </Field>
          <Field label="Password">
            <TextInput type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
          </Field>
          {signIn.error && <p role="alert" className="text-sm text-danger">{signIn.error.message}</p>}
          <Button type="submit" variant="primary" size="medium" className="w-full" disabled={signIn.isPending}>
            {signIn.isPending ? 'Logging in…' : 'Log in'}
          </Button>
        </form>
      </Card>
    </main>
  );
}
