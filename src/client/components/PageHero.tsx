import type { ReactNode } from "react";
export function PageHero({
  title,
  subtitle,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div className="page-heading">
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-description">{subtitle}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  );
}
