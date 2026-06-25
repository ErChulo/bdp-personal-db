import type { ReactNode } from 'react';

type Tone = 'loading' | 'empty' | 'success' | 'error' | 'info';

export function SectionStateBanner({
  tone,
  children,
}: {
  tone: Tone;
  children: ReactNode;
}) {
  if (children == null) return null;
  const className =
    tone === 'error' ? 'banner danger' :
    tone === 'success' ? 'banner ok' :
    'banner';
  const style =
    tone === 'loading' || tone === 'empty' || tone === 'info'
      ? { color: 'var(--fg-muted)' }
      : undefined;
  const role = tone === 'error' ? 'alert' : 'status';
  return (
    <div className={className} role={role} style={style}>
      {children}
    </div>
  );
}
