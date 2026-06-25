import { useMemo, useState } from 'react';
import { SectionStateBanner } from './SectionState';

export function VaultGate({
  mode,
  message,
  onSetup,
  onUnlock,
  onReset,
  busy = false,
}: {
  mode: 'setup' | 'locked';
  message: string | null;
  busy?: boolean;
  onSetup: (passphrase: string) => Promise<void>;
  onUnlock: (passphrase: string) => Promise<void>;
  onReset: () => Promise<void>;
}) {
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const effectiveBusy = busy || working;

  const canSubmit = useMemo(() => {
    if (effectiveBusy) return false;
    if (mode === 'setup') return passphrase.trim().length > 0 && passphrase === confirmPassphrase;
    return passphrase.trim().length > 0;
  }, [effectiveBusy, mode, passphrase, confirmPassphrase]);

  async function submit() {
    setError(null);
    setWorking(true);
    try {
      if (mode === 'setup') {
        if (passphrase !== confirmPassphrase) throw new Error('Passphrases do not match');
        await onSetup(passphrase);
      } else {
        await onUnlock(passphrase);
      }
      setPassphrase('');
      setConfirmPassphrase('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setWorking(false);
    }
  }

  async function reset() {
    setError(null);
    if (!confirm('Reset the vault and remove all protected local data?')) return;
    setWorking(true);
    try {
      await onReset();
      setPassphrase('');
      setConfirmPassphrase('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="vault-gate">
      <div className="vault-card">
        <div className="vault-mark" aria-hidden="true">◉</div>
        <h1>{mode === 'setup' ? 'Set up local vault' : 'Unlock local vault'}</h1>
        <p>
          BDP stores your data locally. The vault passphrase keeps SQL and NoSQL content encrypted at rest until you unlock it in this browser profile.
        </p>
        {message && <SectionStateBanner tone="info">{message}</SectionStateBanner>}
        {error && <SectionStateBanner tone="error">{error}</SectionStateBanner>}
        <label htmlFor="vault-passphrase">Passphrase</label>
        <input
          id="vault-passphrase"
          name="vaultPassphrase"
          type="password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          autoComplete="new-password"
          placeholder="Enter passphrase"
        />
        {mode === 'setup' && (
          <>
            <label htmlFor="vault-passphrase-confirm">Confirm passphrase</label>
            <input
              id="vault-passphrase-confirm"
              name="vaultPassphraseConfirm"
              type="password"
              value={confirmPassphrase}
              onChange={(e) => setConfirmPassphrase(e.target.value)}
              autoComplete="new-password"
              placeholder="Repeat passphrase"
            />
          </>
        )}
        <div className="btn-row" style={{ marginTop: 8 }}>
          <button className="btn-primary" disabled={!canSubmit} onClick={() => void submit()}>
            {effectiveBusy ? 'working…' : mode === 'setup' ? 'Create vault' : 'Unlock vault'}
          </button>
          <button onClick={() => void reset()} disabled={effectiveBusy}>Reset vault</button>
        </div>
      </div>
    </div>
  );
}
