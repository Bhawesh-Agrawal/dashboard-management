import { PageHeader } from "@/components/shared/page-header";
import { DsaNav } from "./dsa-nav";

interface DsaShellProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  backHref?: string;
  children: React.ReactNode;
}

export function DsaShell({
  title,
  subtitle,
  action,
  backHref,
  children,
}: DsaShellProps) {
  return (
    <div>
      <PageHeader
        title={title}
        subtitle={subtitle}
        action={action}
        backHref={backHref}
      />
      <DsaNav />
      {children}
    </div>
  );
}
