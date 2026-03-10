import { ReactNode } from 'react';

type PageHeaderProps = {
  kicker?: string;
  title: string;
  subtitle?: string;
  rightSlot?: ReactNode;
  subtitleClassName?: string;
  rightSlotClassName?: string;
};

export default function PageHeader({
  kicker,
  title,
  subtitle,
  rightSlot,
  subtitleClassName = '',
  rightSlotClassName = '',
}: PageHeaderProps) {
  return (
    <div className="mb-8 sm:mb-10">
      {kicker ? <p className="wmi-kicker">{kicker}</p> : null}

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="wmi-h1 max-w-4xl text-balance">{title}</h1>
        {rightSlot ? <div className={`shrink-0 self-start sm:self-auto ${rightSlotClassName}`.trim()}>{rightSlot}</div> : null}
      </div>

      {subtitle ? (
        <p className={`wmi-body mt-3 max-w-3xl text-[0.98rem] sm:mt-4 sm:text-lg ${subtitleClassName}`.trim()}>
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

