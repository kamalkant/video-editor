import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

const TONES = {
  info: "bg-primary-soft border-primary text-ink",
  warning: "bg-warn-soft border-warn-line text-warn-ink",
  error: "bg-danger-soft border-danger text-ink",
  success: "bg-success-soft border-success text-ink",
} as const;
const ICONS: Record<keyof typeof TONES, { icon: IconName; color: string }> = {
  info: { icon: "info", color: "text-link" },
  warning: { icon: "alert", color: "text-warn-line" },
  error: { icon: "close", color: "text-danger" },
  success: { icon: "check", color: "text-success" },
};

export function Notice({ tone, title, children, actions, id, role }: { tone: keyof typeof TONES; title?: string; children?: ReactNode; actions?: ReactNode; id?: string; role?: "alert" | "status" }) {
  return (
    <div id={id} role={role} className={`rounded-[var(--radius-control)] border-l-4 px-3 py-2 text-sm ${TONES[tone]}`}>
      <div className="flex gap-2">
        <span className={`mt-0.5 ${ICONS[tone].color}`}>
          <Icon name={ICONS[tone].icon} className="size-4" />
        </span>
        <div className="min-w-0">
          {title && <p className="font-semibold">{title}</p>}
          {children && <div className="text-sm">{children}</div>}
          {actions && <div className="mt-2 flex flex-wrap gap-2">{actions}</div>}
        </div>
      </div>
    </div>
  );
}
