import { Component, type ReactNode } from 'react';

/** Empêche une erreur sur un écran de faire disparaître toute l'application. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="mt-10 space-y-3 rounded-2xl bg-red-50 p-5 text-red-900 dark:bg-red-950/40 dark:text-red-100">
        <p className="font-bold">Cet écran a rencontré un problème.</p>
        <p className="text-sm">Vos données ne sont pas touchées. Revenez en arrière ou rechargez l'application.</p>
        <p className="text-xs opacity-70">{this.state.error.message}</p>
        <button type="button" onClick={() => location.reload()} className="min-h-11 rounded-xl bg-red-600 px-4 font-semibold text-white">
          Recharger
        </button>
      </div>
    );
  }
}
