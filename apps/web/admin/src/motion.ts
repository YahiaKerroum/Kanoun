import type { Transition, Variants } from "framer-motion";

export const tapSpring: Transition = {
  type: "spring",
  stiffness: 600,
  damping: 17,
};

export const bouncy: Transition = {
  type: "spring",
  stiffness: 320,
  damping: 19,
};

export const gentleSpring: Transition = {
  type: "spring",
  stiffness: 260,
  damping: 24,
};

export const navItemVariants: Variants = {
  rest: { scale: 1 },
  hover: {
    scale: 1.04,
    transition: bouncy,
  },
  tap: {
    scale: 0.93,
    transition: tapSpring,
  },
  active: {
    scale: 1,
    transition: gentleSpring,
  },
};

export const actionButtonVariants: Variants = {
  rest: { scale: 1 },
  hover: {
    scale: 1.04,
    transition: gentleSpring,
  },
  tap: {
    scale: 0.94,
    transition: tapSpring,
  },
};

export const iconButtonVariants: Variants = {
  rest: { scale: 1 },
  hover: {
    scale: 1.1,
    transition: bouncy,
  },
  tap: {
    scale: 0.85,
    transition: tapSpring,
  },
};

export const sectionContainerVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  enter: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.18,
      ease: "easeOut",
      when: "beforeChildren",
      staggerChildren: 0.055,
    },
  },
  exit: {
    opacity: 0,
    y: -6,
    transition: { duration: 0.12 },
  },
};

export const staggerContainerVariants: Variants = {
  initial: {},
  enter: { transition: { staggerChildren: 0.048 } },
};

export const fadeUpItemVariants: Variants = {
  initial: { opacity: 0, y: 10, scale: 0.98 },
  enter: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: bouncy,
  },
};

export const cardHoverVariants: Variants = {
  rest: { y: 0, scale: 1 },
  hover: {
    y: -2,
    scale: 1.01,
    transition: gentleSpring,
  },
  tap: {
    scale: 0.985,
    transition: tapSpring,
  },
};
