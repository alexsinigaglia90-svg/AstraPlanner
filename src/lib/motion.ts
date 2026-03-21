/**
 * Framer Motion spring configurations and animation variants
 * for AstraPlanner's tactile, spring-physics-driven UI.
 *
 * Section 6 of docs/design-system/MASTER.md
 */

import type { Transition, Variants } from 'framer-motion';

// ============================================================
// Spring physics configurations (Section 6.1)
// ============================================================

/** Quick, snappy — buttons, toggles */
export const snappy: Transition = {
  type: 'spring',
  stiffness: 400,
  damping: 25,
  mass: 0.8,
};

/** Bouncy — card hovers, menu opens, success states */
export const bouncy: Transition = {
  type: 'spring',
  stiffness: 300,
  damping: 20,
  mass: 1.0,
};

/** Gentle — page transitions, large element moves */
export const gentle: Transition = {
  type: 'spring',
  stiffness: 200,
  damping: 26,
  mass: 1.2,
};

/** Wobbly — celebration moments, achievement unlocks */
export const wobbly: Transition = {
  type: 'spring',
  stiffness: 180,
  damping: 12,
  mass: 1.0,
};

/** All spring configs collected */
export const springs = { snappy, bouncy, gentle, wobbly } as const;

// ============================================================
// Commonly used animation variants (Section 6.3)
// ============================================================

/**
 * Staggered list entrance — individual item variant.
 * Pair with `containerStagger` on the parent.
 */
export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: bouncy,
  },
};

/**
 * Button press effect — scale down on tap/click.
 *
 * Usage:
 *   <motion.button variants={scalePress} whileTap="press">
 */
export const scalePress: Variants = {
  press: {
    scale: 0.95,
    transition: snappy,
  },
};

/**
 * Container variant that staggers its children.
 * Use with `fadeInUp` on each child element.
 *
 * Usage:
 *   <motion.ul variants={containerStagger} initial="hidden" animate="show">
 *     {items.map(item => (
 *       <motion.li key={item.id} variants={fadeInUp}>{item.name}</motion.li>
 *     ))}
 *   </motion.ul>
 */
export const containerStagger: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04,  // 40ms between each child
      delayChildren: 0.1,     // 100ms before first child
    },
  },
};
