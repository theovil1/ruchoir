import type { InputHTMLAttributes, ReactNode } from "react";
import { Icon } from "./Icon";

export type InputSize = "sm" | "md" | "lg";

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
  size?: InputSize;
  icon?: string;
  suffix?: ReactNode;
  invalid?: boolean;
};

/** Single-line text field. */
export function Input({
  size = "md",
  icon,
  suffix,
  invalid,
  disabled,
  className = "",
  ...rest
}: InputProps) {
  return (
    <div
      className={`wc-inp wc-inp--${size}${invalid ? " wc-inp--invalid" : ""}${disabled ? " wc-inp--disabled" : ""} ${className}`}
    >
      {icon ? <Icon className="wc-inp__ico" name={icon} size={size === "lg" ? 18 : 14} /> : null}
      <input disabled={disabled} aria-invalid={invalid || undefined} {...rest} />
      {suffix ? <span className="wc-inp__suffix">{suffix}</span> : null}
    </div>
  );
}
