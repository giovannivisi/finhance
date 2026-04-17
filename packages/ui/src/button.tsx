import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-full font-heading font-bold text-sm transition-all focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 ring-offset-background",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-br from-primary to-primaryContainer text-onPrimary shadow-ambient hover:shadow-lg active:scale-95",
        secondary:
          "bg-surfaceContainerHighest text-onSurface hover:bg-surfaceContainerHigh active:scale-95",
        tertiary:
          "bg-transparent text-primary hover:bg-surfaceContainerLow active:scale-95",
      },
      size: {
        default: "h-12 px-6 py-2",
        sm: "h-9 rounded-full px-4 text-xs",
        lg: "h-14 rounded-full px-8 text-base",
        icon: "h-12 w-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
