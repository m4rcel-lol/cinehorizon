import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';

export function Button({ children, ...props }: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>>) {
  return <button className={`ch-button ${props.className ?? ''}`.trim()} {...props}>{children}</button>;
}

export function Badge({ children }: PropsWithChildren) {
  return <span className="ch-badge">{children}</span>;
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`ch-skeleton ${className}`.trim()} />;
}
