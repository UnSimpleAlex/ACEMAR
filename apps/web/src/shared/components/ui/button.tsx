import { useContext } from "react";
import { ModalContext } from "../modal-context";
import type { ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
const variants = cva("btn", {
  variants: {
    variant: {
      default: "btn-primary",
      secondary: "btn-secondary",
      destructive: "btn-danger",
      ghost: "btn-ghost",
    },
  },
  defaultVariants: { variant: "default" },
});
export function Button({
  className,
  variant,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof variants>) {
  const modal = useContext(ModalContext);
  return (
    <button
      type={type}
      className={twMerge(clsx(variants({ variant }), className))}
      form={props.form ?? modal?.formId}
      {...props}
    />
  );
}
