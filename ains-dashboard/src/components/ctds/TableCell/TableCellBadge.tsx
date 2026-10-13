import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

import { Badge, type BadgeStatus, type BadgeVariant } from "../Badge";
import styles from "./TableCell.module.css";

export type TableCellBadgeProps = HTMLAttributes<HTMLSpanElement> & {
  children?: ReactNode;
  status?: BadgeStatus;
  variant?: BadgeVariant;
};

export const TableCellBadge = forwardRef<HTMLSpanElement, TableCellBadgeProps>(
  function TableCellBadge({ className, children, status, variant = "soft", ...rest }, ref) {
    const cls = [styles.base, className ?? ""].filter(Boolean).join(" ");
    return (
      <span ref={ref} className={cls} {...rest}>
        <Badge size="sm" variant={variant} status={status}>
          {children}
        </Badge>
      </span>
    );
  },
);
