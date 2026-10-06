import type { Transition, Variants } from "framer-motion";

/*
 * Motion answers an action: a page settling in after navigation, a list
 * filling after a load, the active rail item sliding to its new place.
 * Short ease-out tweens only (see `--ease-out` in design-system.css);
 * pressing controls is handled in CSS.
 */
const easeOut = [0.22, 1, 0.36, 1] as const;

export const settle: Transition = { duration: 0.2, ease: easeOut };

export const navItemVariants: Variants = {
  rest: {},
  active: {},
};

export const navPillTransition: Transition = { duration: 0.26, ease: easeOut };

export const sectionContainerVariants: Variants = {
  initial: { opacity: 0, y: 6 },
  enter: {
    opacity: 1,
    y: 0,
    transition: { ...settle, when: "beforeChildren", staggerChildren: 0.04 },
  },
  exit: { opacity: 0, transition: { duration: 0.1, ease: "easeIn" } },
};

export const staggerContainerVariants: Variants = {
  initial: {},
  enter: { transition: { staggerChildren: 0.035 } },
};

export const fadeUpItemVariants: Variants = {
  initial: { opacity: 0, y: 6 },
  enter: { opacity: 1, y: 0, transition: settle },
};
