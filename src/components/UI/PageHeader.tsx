import type { ReactNode } from 'react';

export function PageHeader({ eyebrow, title, description, children }: {
  eyebrow: string; title: string; description?: string; children?: ReactNode;
}) {
  return <header className="page-header">
    <div><p className="eyebrow">{eyebrow}</p><h1 tabIndex={-1}>{title}</h1>{description && <p className="page-description">{description}</p>}</div>
    {children && <div className="page-header-actions">{children}</div>}
  </header>;
}
