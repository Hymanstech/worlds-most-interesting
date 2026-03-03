import { ReactNode } from 'react';

type PageHeaderProps = {
  kicker?: string;
  title: string;
  subtitle?: string;
  rightSlot?: ReactNode;
};

export default function PageHeader({ kicker, title, subtitle, rightSlot }: PageHeaderProps) {
  return (
    <div className="mb-9">
      {kicker ? <p className="wmi-kicker">{kicker}</p> : null}

      <div className="mt-2 flex items-end justify-between gap-4">
        <h1 className="wmi-h1 max-w-2xl">{title}</h1>
        {rightSlot ? <div className="shrink-0">{rightSlot}</div> : null}
      </div>

      {subtitle ? <p className="wmi-body mt-4 max-w-3xl text-sm">{subtitle}</p> : null}
    </div>
  );
}

