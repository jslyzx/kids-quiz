import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

/* ========================================
   面包屑
   ======================================== */

interface Crumb {
  label: ReactNode;
  to?: string;
}

export function Breadcrumb({ items }: { items: Crumb[] }) {
  if (!items.length) return null;
  return (
    <nav className="breadcrumb" aria-label="路径">
      <ol>
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={index} aria-current={isLast ? 'page' : undefined}>
              {item.to && !isLast ? (
                <Link to={item.to}>{item.label}</Link>
              ) : (
                <span>{item.label}</span>
              )}
              {!isLast && <span className="breadcrumb-sep" aria-hidden="true">/</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
