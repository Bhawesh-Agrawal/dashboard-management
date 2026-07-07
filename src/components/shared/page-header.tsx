interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6 sm:mb-8">
      <div className="space-y-1">
        <h1 className="page-heading">{title}</h1>
        {subtitle && (
          <p className="section-label">{subtitle}</p>
        )}
      </div>
      {action && <div className="sm:shrink-0">{action}</div>}
    </div>
  );
}
